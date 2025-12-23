import uvicorn

if __name__ == "__main__":
    # Run the OpenAI-compatible gateway on port 6002
    uvicorn.run("app.main:app", host="0.0.0.0", port=6002)