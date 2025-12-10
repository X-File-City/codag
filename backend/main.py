from fastapi import FastAPI, Depends, HTTPException, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import secrets
import json

from models import (
    UserCreate, UserLogin, Token, User, AnalyzeRequest, WorkflowGraph,
    DeviceCheckRequest, DeviceCheckResponse, DeviceLinkRequest,
    OAuthUser, AuthStateResponse
)
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_token,
    users_db
)
from database import (
    get_db, init_db,
    get_or_create_trial_device, increment_trial_usage,
    get_or_create_user, link_device_to_user
)
from oauth import (
    oauth, get_github_user_info, get_google_user_info,
    is_github_configured, is_google_configured
)
from gemini_client import gemini_client
from analyzer import static_analyzer
from config import settings

app = FastAPI(title="Codag")

# Add session middleware for OAuth state
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Remaining-Analyses"],
)


@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    await init_db()


# =============================================================================
# Device/Trial Auth Endpoints
# =============================================================================

@app.post("/auth/device", response_model=DeviceCheckResponse)
async def check_device(
    request: DeviceCheckRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Check or register a trial device.
    Returns remaining analyses for the day.
    """
    device, remaining = await get_or_create_trial_device(db, request.machine_id)

    return DeviceCheckResponse(
        machine_id=request.machine_id,
        remaining_analyses=remaining,
        is_trial=True,
        is_authenticated=device.user_id is not None
    )


@app.post("/auth/device/link")
async def link_device(
    request: DeviceLinkRequest,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Link a trial device to an authenticated user.
    Called after OAuth signup.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")
    token_data = decode_token(token)

    if not token_data.user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    import uuid
    await link_device_to_user(db, request.machine_id, uuid.UUID(token_data.user_id))

    return {"status": "linked"}


# =============================================================================
# OAuth Endpoints
# =============================================================================

@app.get("/auth/github")
async def github_login(request: Request, state: Optional[str] = None):
    """Redirect to GitHub OAuth."""
    if not is_github_configured():
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")

    # Store state in session for CSRF protection
    if state:
        request.session['oauth_state'] = state

    redirect_uri = f"{settings.backend_url}/auth/github/callback"
    return await oauth.github.authorize_redirect(request, redirect_uri)


@app.get("/auth/github/callback")
async def github_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Handle GitHub OAuth callback."""
    if not is_github_configured():
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")

    try:
        token = await oauth.github.authorize_access_token(request)
        user_info = await get_github_user_info(token)

        if not user_info.get('email'):
            # Redirect with error
            return RedirectResponse(
                url="vscode://codag.codag/auth/callback?error=no_email",
                status_code=302
            )

        # Create or update user
        user = await get_or_create_user(
            db,
            email=user_info['email'],
            name=user_info.get('name'),
            avatar_url=user_info.get('avatar_url'),
            provider='github',
            provider_id=user_info['provider_id'],
        )

        # Generate JWT with user_id
        jwt_token = create_access_token({
            "sub": user.email,
            "user_id": str(user.id)
        })

        # Redirect back to VSCode extension
        return RedirectResponse(
            url=f"vscode://codag.codag/auth/callback?token={jwt_token}",
            status_code=302
        )
    except Exception as e:
        return RedirectResponse(
            url=f"vscode://codag.codag/auth/callback?error={str(e)}",
            status_code=302
        )


@app.get("/auth/google")
async def google_login(request: Request, state: Optional[str] = None):
    """Redirect to Google OAuth."""
    if not is_google_configured():
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Store state in session for CSRF protection
    if state:
        request.session['oauth_state'] = state

    redirect_uri = f"{settings.backend_url}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Handle Google OAuth callback."""
    if not is_google_configured():
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = await get_google_user_info(token)

        if not user_info.get('email'):
            return RedirectResponse(
                url="vscode://codag.codag/auth/callback?error=no_email",
                status_code=302
            )

        # Create or update user
        user = await get_or_create_user(
            db,
            email=user_info['email'],
            name=user_info.get('name'),
            avatar_url=user_info.get('avatar_url'),
            provider='google',
            provider_id=user_info['provider_id'],
        )

        # Generate JWT with user_id
        jwt_token = create_access_token({
            "sub": user.email,
            "user_id": str(user.id)
        })

        # Redirect back to VSCode extension
        return RedirectResponse(
            url=f"vscode://codag.codag/auth/callback?token={jwt_token}",
            status_code=302
        )
    except Exception as e:
        return RedirectResponse(
            url=f"vscode://codag.codag/auth/callback?error={str(e)}",
            status_code=302
        )


@app.get("/auth/me", response_model=OAuthUser)
async def get_me(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Get current authenticated user info."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")
    token_data = decode_token(token)

    if not token_data.user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    from sqlalchemy import select
    from database import UserDB
    import uuid

    result = await db.execute(
        select(UserDB).where(UserDB.id == uuid.UUID(token_data.user_id))
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return OAuthUser(
        id=str(user.id),
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        provider=user.provider,
        is_paid=user.is_paid
    )


# =============================================================================
# Legacy Auth Endpoints (kept for backwards compatibility)
# =============================================================================

@app.post("/auth/register", response_model=Token)
async def register(user: UserCreate):
    if user.email in users_db:
        raise HTTPException(status_code=400, detail="Email already registered")

    users_db[user.email] = {
        "email": user.email,
        "hashed_password": get_password_hash(user.password),
        "is_paid": False,
        "requests_today": 0,
        "last_request_date": None
    }

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/auth/login", response_model=Token)
async def login(user: UserLogin):
    user_data = users_db.get(user.email)
    if not user_data or not verify_password(user.password, user_data["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}


# =============================================================================
# Analysis Endpoint
# =============================================================================

@app.post("/analyze", response_model=WorkflowGraph)
async def analyze_workflow(
    request: AnalyzeRequest,
    response: Response,
    x_device_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Analyze code for LLM workflow patterns.

    Authentication:
    - X-Device-ID header: Trial mode (5 analyses/day)
    - Authorization: Bearer <token>: Authenticated mode (unlimited)
    """
    remaining_analyses = -1  # -1 means unlimited (authenticated)

    # Check authentication
    if authorization and authorization.startswith("Bearer "):
        # Authenticated user - no rate limit for now
        token = authorization.replace("Bearer ", "")
        try:
            token_data = decode_token(token)
            # Valid token - unlimited access
            remaining_analyses = -1
        except HTTPException:
            # Invalid token - fall through to device check
            authorization = None

    if not authorization and x_device_id:
        # Trial mode - check and decrement quota
        device, remaining = await get_or_create_trial_device(db, x_device_id)

        if remaining <= 0:
            response.headers["X-Remaining-Analyses"] = "0"
            raise HTTPException(
                status_code=429,
                detail="Trial quota exhausted. Sign up for unlimited access."
            )

        # Decrement quota
        remaining_analyses = await increment_trial_usage(db, x_device_id)
        response.headers["X-Remaining-Analyses"] = str(remaining_analyses)

    elif not authorization and not x_device_id:
        # No auth at all - reject
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide X-Device-ID header for trial or Authorization header for full access."
        )

    # Input validation
    MAX_CODE_SIZE = 5_000_000  # 5MB limit
    MAX_FILES = 50  # Reasonable limit on number of files

    if len(request.code) > MAX_CODE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Code size ({len(request.code)} bytes) exceeds maximum allowed size ({MAX_CODE_SIZE} bytes). Try analyzing fewer files or smaller files."
        )

    if request.file_paths and len(request.file_paths) > MAX_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"Number of files ({len(request.file_paths)}) exceeds maximum allowed ({MAX_FILES}). Try analyzing fewer files at once."
        )

    # Static analysis
    framework = request.framework_hint or static_analyzer.detect_framework(
        request.code,
        request.file_paths[0] if request.file_paths else ""
    )

    # Convert metadata to dict format
    metadata_dicts = [m.dict() for m in request.metadata] if request.metadata else None

    # LLM analysis
    try:
        result = gemini_client.analyze_workflow(request.code, framework, metadata_dicts)
        # Clean markdown if present
        result = result.strip()
        if result.startswith("```json"):
            result = result[7:]
        if result.startswith("```"):
            result = result[3:]
        if result.endswith("```"):
            result = result[:-3]

        # Helper to fix file paths from LLM (handles both relative and mangled absolute paths)
        def fix_file_path(path: str, file_paths: list) -> str:
            if not path:
                return path
            # If path is already in file_paths, it's correct
            if path in file_paths:
                return path
            # Extract just the filename and find matching input path
            filename = path.split('/')[-1]
            for input_path in file_paths:
                if input_path.endswith('/' + filename):
                    return input_path
            return path

        # Try to parse JSON
        try:
            graph_data = json.loads(result.strip())
        except json.JSONDecodeError as json_err:
            # Attempt to recover from truncated JSON
            result_clean = result.strip()

            # Try to close unclosed structures
            if not result_clean.endswith('}'):
                # Count braces to determine how many to add
                open_braces = result_clean.count('{') - result_clean.count('}')
                open_brackets = result_clean.count('[') - result_clean.count(']')

                # Remove any incomplete trailing element (after last comma)
                last_comma = result_clean.rfind(',')
                if last_comma > result_clean.rfind('}') and last_comma > result_clean.rfind(']'):
                    result_clean = result_clean[:last_comma]

                # Close arrays first, then objects
                result_clean += ']' * max(0, open_brackets)
                result_clean += '}' * max(0, open_braces)

                try:
                    graph_data = json.loads(result_clean)
                except:
                    # If recovery fails, raise original error with better message
                    raise HTTPException(
                        status_code=500,
                        detail=f"Analysis failed: Response was truncated. Try analyzing fewer files at once. Original error: {str(json_err)}"
                    )
            else:
                raise

        # Fix file paths in nodes (LLM sometimes returns relative paths)
        for node in graph_data.get('nodes', []):
            if node.get('source') and node['source'].get('file'):
                node['source']['file'] = fix_file_path(node['source']['file'], request.file_paths)

        # Fix file paths in edges
        for edge in graph_data.get('edges', []):
            if edge.get('sourceLocation') and edge['sourceLocation'].get('file'):
                edge['sourceLocation']['file'] = fix_file_path(edge['sourceLocation']['file'], request.file_paths)

        return WorkflowGraph(**graph_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
