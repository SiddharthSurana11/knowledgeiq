FROM python:3.11-slim-bookworm

WORKDIR /app

# Copy requirements and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Install SpaCy small English language model
RUN python -m spacy download en_core_web_sm

# Copy application code and protos
COPY . .

# Expose gRPC port
EXPOSE 50052

# Start Embedding Service
CMD ["python", "app.py"]
