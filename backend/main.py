from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import UserCreate, UserLogin, Token, User, AnalyzeRequest, WorkflowGraph
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    check_rate_limit,
    users_db
)
from gemini_client import gemini_client
from analyzer import static_analyzer
import json

app = FastAPI(title="Codag")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/analyze", response_model=WorkflowGraph)
async def analyze_workflow(
    request: AnalyzeRequest,
    # TODO: Re-enable auth when ready
    # current_user: User = Depends(get_current_user)
):
    # TODO: Re-enable rate limiting when ready
    # check_rate_limit(current_user)

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
