# Contribuindo com CountG

Obrigado por considerar uma contribuição para o projeto! Este documento descreve o fluxo de trabalho adotado, o padrão de mensagens de commit e como preparar o ambiente de desenvolvimento.

## Fluxo de trabalho

1. Faça um fork do repositório e clone o seu fork.
2. Crie um branch descritivo para cada alteração (`git checkout -b minha-feature`).
3. Realize alterações pequenas e bem testadas.
4. Garanta que os testes e as ferramentas de lint passam.
5. Abra um Pull Request para a branch principal descrevendo claramente as mudanças.

## Padrão de commits

Utilizamos o formato [Conventional Commits](https://www.conventionalcommits.org/):

- `feat`: nova funcionalidade
- `fix`: correção de bug
- `docs`: alterações apenas na documentação
- `refactor`, `test`, `chore`, etc.

O formato básico é:

```
tipo(escopo opcional): descrição curta

Corpo (opcional)
```

Exemplo:

```
feat: adiciona rota para upload de vídeo
```

## Ambiente de desenvolvimento

1. Requer **Python 3.10+**.
2. Crie e ative um ambiente virtual:
   ```bash
   python -m venv venv
   source venv/bin/activate   # Linux/Mac
   venv\Scripts\activate     # Windows
   ```
3. Instale as dependências principais:
   ```bash
   pip install -r requirements.txt
   ```
4. Instale as dependências de desenvolvimento (lint e testes):
   ```bash
   pip install black flake8 pytest
   ```
5. Execute os testes e verificações de estilo antes de enviar o PR:
   ```bash
   flake8
   pytest
   ```

## Documentação

### Docstrings e arquivos de documentação bilíngues

- Escreva os docstrings e os arquivos em `docs/` sempre em **inglês e português**.
- Use o inglês como primeiro idioma e o português em seguida.
- Nos docstrings, inclua uma linha de resumo combinada (`English summary / resumo em português`) e, após uma linha em branco, separe blocos rotulados com `English:` e `Português:`.
- Os arquivos de documentação devem existir em caminhos paralelos dentro de `docs/en` e `docs/pt`, mantendo o conteúdo sincronizado.

### Construir e visualizar a documentação localmente

1. Instale as dependências de documentação:
   ```bash
   pip install mkdocs mkdocs-material mkdocs-static-i18n
   ```
2. Para visualizar o site localmente, execute:
   ```bash
   mkdocs serve
   ```
   O servidor estará disponível em `http://127.0.0.1:8000`.
3. Para gerar os arquivos estáticos, utilize:
   ```bash
   mkdocs build
   ```

## Dúvidas

Em caso de dúvidas, abra uma issue explicando o problema ou entre em contato através das discussões do repositório.

Obrigado por contribuir!
