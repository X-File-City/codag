import asyncio
import re
from google import genai
from google.genai import types
from config import settings
from prompts import SYSTEM_INSTRUCTION, build_user_prompt

client = genai.Client(api_key=settings.gemini_api_key)


class GeminiClient:
    def __init__(self):
        self.model = 'gemini-2.5-flash'
        self.config = types.GenerateContentConfig(
            temperature=0.0,
            top_p=1.0,
            top_k=1,
            max_output_tokens=65536,
        )

    async def analyze_workflow(self, code: str, framework_hint: str = None, metadata: list = None) -> str:
        """Analyze code for LLM workflow patterns using Gemini."""
        user_prompt = build_user_prompt(code, metadata)
        full_prompt = f"{SYSTEM_INSTRUCTION}\n\n{user_prompt}"

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = await client.aio.models.generate_content(
                    model=self.model,
                    contents=full_prompt,
                    config=self.config,
                )

                # Check finish reason
                if response.candidates:
                    finish_reason = response.candidates[0].finish_reason
                    if finish_reason == 'MAX_TOKENS':
                        raise Exception("Output exceeded token limit. Try reducing batch size.")
                    elif finish_reason == 'SAFETY':
                        raise Exception("Response blocked by safety filters.")
                    elif finish_reason not in ['STOP', 'UNSPECIFIED', None]:
                        raise Exception(f"Generation failed: {finish_reason}")

                return response.text

            except Exception as e:
                error_str = str(e)
                if '429' in error_str or 'quota' in error_str.lower() or 'rate' in error_str.lower():
                    if attempt < max_retries - 1:
                        wait_time = 2 ** attempt
                        match = re.search(r'retry in ([\d.]+)', error_str, re.IGNORECASE)
                        if match:
                            wait_time = float(match.group(1)) / 1000 + 1
                        print(f"Rate limit hit, waiting {wait_time:.2f}s before retry {attempt + 1}/{max_retries}")
                        await asyncio.sleep(wait_time)
                    else:
                        raise
                else:
                    raise


gemini_client = GeminiClient()
