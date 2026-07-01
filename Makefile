.PHONY: install
install:
	npm install

.PHONY: dev
dev:
	npm run dev

.PHONY: build
build:
	npm run build

.PHONY: test
test:
	npm run test

.PHONY: clean
clean:
	rm -rf dist/ node_modules/
