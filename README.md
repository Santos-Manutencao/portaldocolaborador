# 🛠️ SGP SANTOS MANUTENÇÃO - Portal do Colaborador & Gestão de RH

<p align="center">
  <img src="static/logo-transparent.png" alt="Santos Manutenção" width="280">
</p>

<p align="center">
  <strong>Sistema de Gestão de Pessoal e Portal de Autosserviço do Colaborador</strong><br>
  Santos Manutenções &bull; Contracheques &bull; Benefícios &bull; Gestão de Férias CLT
</p>

<p align="center">
  <a href="https://santos-manutencao.github.io/portaldocolaborador/"><img src="https://img.shields.io/badge/Acessar%20Online-GitHub%20Pages-2563eb?style=for-the-badge&logo=github" alt="Acessar Online no GitHub Pages"></a>
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

## 🌐 Acesso Online Oficial (GitHub Pages)

O **Portal do Colaborador** está hospedado de forma 100% gratuita e de alta disponibilidade diretamente pelo **GitHub Pages**:

🔗 **Link Oficial do Portal:** [https://santos-manutencao.github.io/portaldocolaborador/](https://santos-manutencao.github.io/portaldocolaborador/)

- 📱 **Otimizado para Celulares**: Visualização em lista limpa, download direto de PDF e leitor integrado.
- ⚡ **Sem Servidores Externos**: Não necessita de Render, Railway ou VPS.
- 🔄 **Sincronização com 1 Clique**: No painel administrativo local, clique no botão **"Atualizar Online"** para publicar instantaneamente novos contracheques ou atualizações cadastrais.

---

## 🚀 Execução Local (Painel Administrativo RH)

Para gerenciar colaboradores, cadastrar holerites e emitir férias:
```bash
python server.py
```
Acesse:
- **Painel Administrativo RH**: [http://localhost:8080](http://localhost:8080)
- **Portal Local de Testes**: [http://localhost:8080/portal](http://localhost:8080/portal)

### Execução com Docker (Opcional)
```bash
docker-compose up -d
```

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
