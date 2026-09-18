# 🛠️ SGP SANTOS MANUTENÇÃO - Portal do Colaborador & Gestão de RH

<p align="center">
  <img src="static/logo-transparent.png" alt="Santos Manutenção" width="280">
</p>

<p align="center">
  <strong>Sistema de Gestão de Pessoal e Portal de Autosserviço do Colaborador</strong><br>
  Santos Manutenções &bull; Contracheques &bull; Benefícios &bull; Gestão de Férias CLT
</p>

<p align="center">
  <a href="https://render.com/deploy"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render"></a>
</p>

---

## 🌟 Principais Funcionalidades

### 📱 Portal do Colaborador (`/portal`)
- **Acesso Seguro**: Login por CPF ou Matrícula com senha individual criptografada.
- **Visualização de Contracheques**:
  - **Modo Lista (Padrão)**: Tabela limpa com competência, data, tamanho, valor líquido e botões rápidos.
  - **Modo Grade**: Exibição em cards com detalhes visuais e resumo.
  - **Visualizador Integrado**: Leitor de PDF e imagens diretamente no navegador.
  - **Download Seguro**: Baixa de PDFs oficiais com tokens de acesso.
- **Painel de Férias CLT**: Consulta transparente do status de férias (em dia, risco de dobra, vencida) conforme Art. 134 e 137 da CLT.
- **Foto do Perfil**: Foto oficial do colaborador ou avatar com iniciais.
- **Troca de Senha**: Autoatendimento para alteração da senha pessoal do colaborador.

### 💼 Painel Administrativo de RH (`/`)
- **Gestão Completa de Colaboradores**: Cadastro com foto, edição, busca por nome/cargo/matrícula, dados bancários e contratuais.
- **Anexação de Contracheques em Lote**:
  - Leitura automática de múltiplos arquivos PDF simultâneos.
  - Reconhecimento automático do colaborador através do nome do arquivo.
  - Associação direta com competência e ano.
- **Exclusão de Contracheques em Lote**: Remoção em massa de holerites por competência/ano de todos os colaboradores com exclusão física dos arquivos.
- **Gestão de Férias com Abatimento Automático**: Cálculo e controle de períodos aquisitivos/concessivos, registro de gozo e abatimento de saldo.
- **Controle de Acesso Administrativo**: Login restrito para gestores do RH com auditoria de sessões.

---

## 🚀 Como Colocar Funcionando Online

### Opção 1: Deploy no Render (Recomendado - Gratuito)
1. Acesse [render.com](https://render.com) e conecte sua conta do GitHub.
2. Clique em **New +** -> **Web Service**.
3. Selecione o repositório `Santos-Manutencao/portaldocolaborador`.
4. O Render detectará automaticamente as configurações através do arquivo `render.yaml` ou configure:
   - **Environment**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python server.py`
5. Clique em **Create Web Service**. Em instantes seu sistema estará online com HTTPS gratuito!

### Opção 2: Deploy no Railway
1. Acesse [railway.app](https://railway.app).
2. Clique em **New Project** -> **Deploy from GitHub repo**.
3. Selecione `Santos-Manutencao/portaldocolaborador`.
4. O Railway detectará o `Procfile` / `Dockerfile` e iniciará o sistema online imediatamente.

### Opção 3: Executar com Docker
```bash
# Construir a imagem Docker
docker build -t portaldocolaborador .

# Rodar o container na porta 8080
docker run -d -p 8080:8080 -v $(pwd)/sgp_database.db:/app/sgp_database.db --name portaldocolaborador portaldocolaborador
```
Ou utilizando `docker-compose`:
```bash
docker-compose up -d
```

### Opção 4: Execução Local (Windows / Linux / Mac)
```bash
# Iniciar o servidor
python server.py
```
Acesse no seu navegador:
- **Painel Administrativo**: [http://localhost:8080](http://localhost:8080)
- **Portal do Colaborador**: [http://localhost:8080/portal](http://localhost:8080/portal)

---

## 🔐 Acesso Padrão

- **Administrador**:
  - Usuário: `admin`
  - Senha: Ver credenciais configuradas na inicialização do sistema.
- **Colaborador**:
  - Identificador: CPF ou Matrícula
  - Senha Inicial: 4 primeiros dígitos do CPF

---

## 📄 Licença e Direitos
Desenvolvido para **Santos Manutenção** &bull; Todos os direitos reservados.
