.PHONY: install install-web dev api web test generate-data fetch-hemibrain build-hemibrain train train-hemibrain train-fewshot benchmark ablate lint clean docker-up

ROOT := $(shell pwd)
export PYTHONPATH := $(ROOT)

install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -U pip && pip install -e ".[dev]"
	cd apps/web && npm install

install-py:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -U pip && pip install -e ".[dev]"

install-web:
	cd apps/web && npm install

generate-data:
	. .venv/bin/activate && python -m research.datasets.generate_sensitive_dataset
	. .venv/bin/activate && python -m research.datasets.generate_hard_legal_dataset
	. .venv/bin/activate && python -m research.datasets.generate_harder_legal_dataset
	. .venv/bin/activate && python -m research.graphs.build_demo_connectome

fetch-hemibrain:
	. .venv/bin/activate && python scripts/fetch_hemibrain.py

build-hemibrain: fetch-hemibrain
	. .venv/bin/activate && python -m research.graphs.build_hemibrain_connectome --max-nodes 3072 --min-weight 2

train:
	. .venv/bin/activate && python -m research.experiments.run --model all --seed 42

train-hemibrain: build-hemibrain
	. .venv/bin/activate && rm -rf models/connectome models/random_erdos models/random_degree_preserving models/random_weights
	. .venv/bin/activate && python -m research.experiments.run --model all --seed 42
	. .venv/bin/activate && python -m research.experiments.compare --seeds 42,43 --models connectome,random_erdos,random_degree_preserving,linear
	. .venv/bin/activate && python -m research.experiments.ablate --seed 42

train-fewshot:
	. .venv/bin/activate && python -m research.datasets.generate_harder_legal_dataset
	. .venv/bin/activate && python -m research.experiments.compare --seeds 42,43,44,45,46 --models connectome,random_erdos,random_degree_preserving,linear --max-train 80 --encoder minilm --out comparison_fewshot_80.json
	cp results/comparison_fewshot_80.json results/comparison_fewshot_latest.json
	. .venv/bin/activate && LEGALFLY_ENCODER=minilm python -m research.experiments.run --model all --seed 42

benchmark:
	. .venv/bin/activate && python -m research.experiments.compare --seeds 42,43,44

ablate:
	. .venv/bin/activate && python -m research.experiments.ablate --seed 42

api:
	. .venv/bin/activate && uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload

web:
	cd apps/web && npm run dev

dev:
	@echo "Start API: make api"
	@echo "Start Web: make web"

test:
	. .venv/bin/activate && pytest -q
	cd apps/web && npm test --if-present

lint:
	. .venv/bin/activate && ruff check research apps/api tests
	cd apps/web && npm run lint

clean:
	rm -rf .venv apps/web/.next apps/web/node_modules .pytest_cache **/__pycache__

docker-up:
	docker compose up --build
