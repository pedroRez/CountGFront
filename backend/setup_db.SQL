-- =============================================================================
-- PARTE 1: CRIAÇÃO DO USUÁRIO E DO BANCO DE DADOS
-- Conecte-se ao banco de dados padrão 'postgres' como superusuário para rodar esta parte.
-- =============================================================================

-- (Opcional) Limpa o usuário e o banco se já existirem, para que o script possa ser rodado novamente.
DROP DATABASE IF EXISTS kyoday_db;
DROP USER IF EXISTS kyoday_user;

-- Cria o usuário que a sua aplicação usará para se conectar ao banco.
-- IMPORTANTE: Substitua 'sua_senha_segura_aqui' por uma senha forte e segura.
CREATE USER kyoday_user WITH PASSWORD 'root';

-- Cria o banco de dados e define o usuário recém-criado como o dono.
CREATE DATABASE kyoday_db OWNER kyoday_user;

-- Concede ao usuário a permissão de se conectar ao novo banco de dados.
GRANT CONNECT ON DATABASE kyoday_db TO kyoday_user;

-- FIM DA PARTE 1.
-- Desconecte do psql e reconecte ao banco de dados 'kyoday_db' como superusuário para rodar a Parte 2.


-- =============================================================================
-- PARTE 2: CRIAÇÃO DA TABELA E CONCESSÃO DE PERMISSÕES
-- Conecte-se ao banco de dados 'kyoday_db' como superusuário para rodar esta parte.
-- =============================================================================

-- Concede ao usuário do aplicativo a permissão para USAR e CRIAR objetos no esquema 'public'.
GRANT USAGE, CREATE ON SCHEMA public TO kyoday_user;

-- Cria a tabela 'video_progress' se ela ainda não existir.
CREATE TABLE IF NOT EXISTS video_progress (
    video_name VARCHAR(255) PRIMARY KEY,
    frame_atual INTEGER DEFAULT 0,
    total_frames_estimado INTEGER DEFAULT 1,
    tempo_inicio DOUBLE PRECISION,
    tempo_restante VARCHAR(50),
    finalizado BOOLEAN DEFAULT FALSE,
    resultado JSONB, -- Usar JSONB é mais eficiente para armazenar os resultados em JSON
    erro TEXT,
    cancelado BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Define o usuário do aplicativo como o dono da nova tabela.
ALTER TABLE video_progress OWNER TO kyoday_user;

-- Concede permissões específicas de SELECT, INSERT, UPDATE, DELETE na tabela para o usuário.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE video_progress TO kyoday_user;

-- Garante que o usuário do aplicativo terá permissões em futuras tabelas ou sequências.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kyoday_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kyoday_user;

-- FIM DA PARTE 2. O banco de dados está pronto.
