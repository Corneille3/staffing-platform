up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec backend alembic upgrade head

seed:
	docker compose exec backend python -m app.scripts.seed_dev_data

test:
	docker compose exec backend pytest

makemigration:
	docker compose exec backend alembic revision --autogenerate -m "$(m)"

backend-shell:
	docker compose exec backend bash

frontend-shell:
	docker compose exec frontend sh

# Production RDS controls (requires AWS CLI + credentials)
PROD_DB_ID := apf-staffing-platform-prod-postgres
PROD_REGION := ca-central-1

db-stop:
	aws rds stop-db-instance --db-instance-identifier $(PROD_DB_ID) --region $(PROD_REGION)
	@echo "Stopping $(PROD_DB_ID) — takes ~1 min."

db-start:
	aws rds start-db-instance --db-instance-identifier $(PROD_DB_ID) --region $(PROD_REGION)
	@echo "Starting $(PROD_DB_ID) — takes ~2 min before connections are accepted."

db-status:
	@aws rds describe-db-instances --db-instance-identifier $(PROD_DB_ID) --region $(PROD_REGION) \
		--query 'DBInstances[0].DBInstanceStatus' --output text
