from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import CORS_ORIGINS
from .api.eeg import router as eeg_router
app = FastAPI(title="EEG Visualizer API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(eeg_router, prefix="/api")
@app.get("/api/health")
async def health(): return {"status": "ok", "service": "EEG Visualizer"}
