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
