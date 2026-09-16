import { describe, it, expect } from 'vitest';
import {
  extractRequirementsTxt,
  extractPyprojectToml,
  extractGoMod,
  extractPomXml,
  extractCargoToml,
  extractPackageJson,
  extractAllDependencies,
} from './index.js';
import type { SourceFile } from '../rules.js';

describe('QG-TDD-004 — Multi-Language Manifest Extractors', () => {
  describe('1. Python — requirements.txt', () => {
    it('extracts pinned, bounded and unpinned dependencies with extras and markers', () => {
      const content = `
# Core Backend Dependencies
fastapi==0.115.0
pydantic>=2.7.0
uvicorn[standard]>=0.30.0
requests[socks]>=2.31.0; python_version >= "3.10"
pytest~=8.2.0
click<=8.1.7
sqlalchemy!=2.0.0,>=1.4.0
gunicorn # unpinned production server
-r base.txt
-i https://pypi.org/simple
--extra-index-url https://custom.pypi.org/
`;
      const deps = extractRequirementsTxt(content, 'requirements.txt');

      expect(deps).toHaveLength(8);

      const fastapi = deps.find((d) => d.name === 'fastapi');
      expect(fastapi).toEqual({
        name: 'fastapi',
        version: '==0.115.0',
        ecosystem: 'python',
        manifest: 'requirements.txt',
        type: 'dependency',
        optional: false,
        indirect: false,
        metadata: {},
      });

      const uvicorn = deps.find((d) => d.name === 'uvicorn');
      expect(uvicorn?.name).toBe('uvicorn');
      expect(uvicorn?.version).toBe('>=0.30.0');
      expect(uvicorn?.metadata?.extras).toEqual(['standard']);

      const requests = deps.find((d) => d.name === 'requests');
      expect(requests?.name).toBe('requests');
      expect(requests?.version).toBe('>=2.31.0');
      expect(requests?.metadata?.extras).toEqual(['socks']);
      expect(requests?.metadata?.markers).toBe('python_version >= "3.10"');

      const gunicorn = deps.find((d) => d.name === 'gunicorn');
      expect(gunicorn?.name).toBe('gunicorn');
      expect(gunicorn?.version).toBe('*');
    });

    it('handles empty or comment-only requirements.txt gracefully', () => {
      const deps = extractRequirementsTxt('# Just a comment\n\n   # Another comment\n', 'requirements.txt');
      expect(deps).toHaveLength(0);
    });
  });

  describe('2. Python — pyproject.toml', () => {
    it('extracts PEP 621 and Poetry standard & optional dependencies', () => {
      const content = `
[project]
name = "qualityguard-py"
version = "0.1.0"
dependencies = [
    "fastapi>=0.115.0",
    "pydantic[email]>=2.7.0",
    "httpx>=0.27.0; python_version >= '3.11'",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "ruff==0.4.0",
]
test = [
    "pytest-cov>=5.0.0",
]
`;
      const deps = extractPyprojectToml(content, 'pyproject.toml');

      expect(deps.length).toBe(6);

      const fastapi = deps.find((d) => d.name === 'fastapi');
      expect(fastapi).toMatchObject({
        name: 'fastapi',
        version: '>=0.115.0',
        ecosystem: 'python',
        manifest: 'pyproject.toml',
        type: 'dependency',
      });

      const pydantic = deps.find((d) => d.name === 'pydantic');
      expect(pydantic?.metadata?.extras).toEqual(['email']);

      const pytest = deps.find((d) => d.name === 'pytest');
      expect(pytest).toMatchObject({
        name: 'pytest',
        version: '>=8.0.0',
        ecosystem: 'python',
        manifest: 'pyproject.toml',
        type: 'devDependency',
        optional: true,
      });
    });

    it('extracts Poetry legacy format dependencies', () => {
      const content = `
[tool.poetry]
name = "poetry-app"
version = "1.0.0"

[tool.poetry.dependencies]
python = "^3.11"
flask = "^3.0.0"
celery = { version = "^5.3.0", extras = ["redis"] }

[tool.poetry.group.dev.dependencies]
black = "^24.3.0"
`;
      const deps = extractPyprojectToml(content, 'pyproject.toml');
      expect(deps.some((d) => d.name === 'flask' && d.version === '^3.0.0')).toBe(true);
      expect(deps.some((d) => d.name === 'celery' && d.version === '^5.3.0')).toBe(true);
      expect(deps.some((d) => d.name === 'black' && d.type === 'devDependency')).toBe(true);
    });
  });

  describe('3. Go — go.mod', () => {
    it('extracts module name, go version, direct and indirect dependencies', () => {
      const content = `
module github.com/GiovaniRodrigo/qualityguard-agent

go 1.23.1

require (
	github.com/gin-gonic/gin v1.10.0
	github.com/stretchr/testify v1.9.0
	golang.org/x/crypto v0.27.0 // indirect
	golang.org/x/net v0.29.0 // indirect
)

require github.com/google/uuid v1.6.0

replace github.com/old/repo => github.com/new/repo v1.0.0
`;
      const deps = extractGoMod(content, 'go.mod');

      expect(deps).toHaveLength(5);

      const gin = deps.find((d) => d.name === 'github.com/gin-gonic/gin');
      expect(gin).toEqual({
        name: 'github.com/gin-gonic/gin',
        version: 'v1.10.0',
        ecosystem: 'go',
        manifest: 'go.mod',
        type: 'dependency',
        optional: false,
        indirect: false,
        metadata: { goVersion: '1.23.1', module: 'github.com/GiovaniRodrigo/qualityguard-agent' },
      });

      const crypto = deps.find((d) => d.name === 'golang.org/x/crypto');
      expect(crypto).toMatchObject({
        name: 'golang.org/x/crypto',
        version: 'v0.27.0',
        ecosystem: 'go',
        manifest: 'go.mod',
        indirect: true,
      });

      const uuid = deps.find((d) => d.name === 'github.com/google/uuid');
      expect(uuid).toMatchObject({
        name: 'github.com/google/uuid',
        version: 'v1.6.0',
        indirect: false,
      });
    });
  });

  describe('4. Java — pom.xml', () => {
    it('extracts Maven dependencies, resolves property versions, and maps scopes', () => {
      const content = `
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.qualityguard</groupId>
  <artifactId>enterprise-service</artifactId>
  <version>1.0.0-SNAPSHOT</version>

  <properties>
    <spring.boot.version>3.3.4</spring.boot.version>
    <lombok.version>1.18.34</lombok.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>\${spring.boot.version}</version>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
      <version>\${spring.boot.version}</version>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <version>\${lombok.version}</version>
      <scope>provided</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.3</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
`;
      const deps = extractPomXml(content, 'pom.xml');

      expect(deps).toHaveLength(4);

      const springWeb = deps.find((d) => d.name === 'org.springframework.boot:spring-boot-starter-web');
      expect(springWeb).toEqual({
        name: 'org.springframework.boot:spring-boot-starter-web',
        version: '3.3.4',
        ecosystem: 'maven',
        manifest: 'pom.xml',
        type: 'dependency',
        optional: false,
        indirect: false,
        metadata: { groupId: 'org.springframework.boot', artifactId: 'spring-boot-starter-web', scope: 'compile' },
      });

      const lombok = deps.find((d) => d.name === 'org.projectlombok:lombok');
      expect(lombok).toMatchObject({
        name: 'org.projectlombok:lombok',
        version: '1.18.34',
        type: 'buildDependency',
        optional: true,
      });

      const junit = deps.find((d) => d.name === 'org.junit.jupiter:junit-jupiter');
      expect(junit).toMatchObject({
        name: 'org.junit.jupiter:junit-jupiter',
        version: '5.10.3',
        type: 'devDependency',
      });
    });
  });

  describe('5. Rust — Cargo.toml', () => {
    it('extracts direct, dev, build, and optional dependencies with features', () => {
      const content = `
[package]
name = "qualityguard-engine"
version = "0.2.0"
edition = "2021"

[dependencies]
tokio = { version = "1.38", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
reqwest = { version = "0.12", optional = true }
tracing = "0.1"

[dev-dependencies]
criterion = "0.5"

[build-dependencies]
cc = "1.0"
`;
      const deps = extractCargoToml(content, 'Cargo.toml');

      expect(deps).toHaveLength(6);

      const tokio = deps.find((d) => d.name === 'tokio');
      expect(tokio).toEqual({
        name: 'tokio',
        version: '1.38',
        ecosystem: 'cargo',
        manifest: 'Cargo.toml',
        type: 'dependency',
        optional: false,
        indirect: false,
        metadata: { features: ['full'] },
      });

      const reqwest = deps.find((d) => d.name === 'reqwest');
      expect(reqwest?.optional).toBe(true);

      const criterion = deps.find((d) => d.name === 'criterion');
      expect(criterion?.type).toBe('devDependency');

      const cc = deps.find((d) => d.name === 'cc');
      expect(cc?.type).toBe('buildDependency');
    });
  });

  describe('6. Node.js — package.json', () => {
    it('extracts npm dependencies, devDependencies, and peerDependencies', () => {
      const content = JSON.stringify({
        name: 'test-app',
        dependencies: {
          fastify: '^4.28.1',
          pg: '^8.13.0',
        },
        devDependencies: {
          typescript: '^5.6.2',
          vitest: '^2.1.1',
        },
        peerDependencies: {
          react: '>=18.0.0',
        },
      });

      const deps = extractPackageJson(content, 'package.json');
      expect(deps).toHaveLength(5);
      expect(deps.find((d) => d.name === 'fastify')?.type).toBe('dependency');
      expect(deps.find((d) => d.name === 'typescript')?.type).toBe('devDependency');
      expect(deps.find((d) => d.name === 'react')?.type).toBe('peerDependency');
    });
  });

  describe('7. Polyglot Multi-Manifest Aggregation (extractAllDependencies)', () => {
    it('scans multi-language source files and returns normalized aggregate inventory', () => {
      const files: SourceFile[] = [
        { path: 'src/main.py', content: 'print("hello")' },
        { path: 'requirements.txt', content: 'fastapi==0.115.0\npydantic>=2.7.0' },
        { path: 'backend/go.mod', content: 'module backend\ngo 1.23\nrequire github.com/gin-gonic/gin v1.10.0' },
        { path: 'core/Cargo.toml', content: '[package]\nname="core"\n[dependencies]\ntokio="1.0"' },
        { path: 'frontend/package.json', content: '{"dependencies":{"react":"^19.0.0"}}' },
        { path: 'service/pom.xml', content: '<project><dependencies><dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId><version>2.0.13</version></dependency></dependencies></project>' },
      ];

      const all = extractAllDependencies(files);

      expect(all).toHaveLength(6);
      expect(all.some((d) => d.ecosystem === 'python' && d.name === 'fastapi')).toBe(true);
      expect(all.some((d) => d.ecosystem === 'go' && d.name === 'github.com/gin-gonic/gin')).toBe(true);
      expect(all.some((d) => d.ecosystem === 'cargo' && d.name === 'tokio')).toBe(true);
      expect(all.some((d) => d.ecosystem === 'npm' && d.name === 'react')).toBe(true);
      expect(all.some((d) => d.ecosystem === 'maven' && d.name === 'org.slf4j:slf4j-api')).toBe(true);
    });
  });
});
