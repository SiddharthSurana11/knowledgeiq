FROM python:3.11-slim-bookworm

WORKDIR /app

# Copy requirements and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and protos
COPY . .

# Expose gRPC port
EXPOSE 50053

# Start LLM Service
CMD ["python", "app.py"]
