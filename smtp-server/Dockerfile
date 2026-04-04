FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose SMTP ports
EXPOSE 25 587 465 9000

# Health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:9000/health 2>/dev/null || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD /healthcheck.sh

# Run the SMTP server
CMD ["python", "smtp_server.py"]
