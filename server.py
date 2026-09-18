import os
import re
import json
import sqlite3
import mimetypes
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import datetime
import hashlib
import secrets
import base64
import unicodedata

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(BASE_DIR, 'sgp_database.db')
STATIC_DIR = os.path.join(BASE_DIR, 'static')
UPLOADS_DIR = os.path.join(BASE_DIR, 'UPLOADS')
CONTRACHEQUES_DIR = os.path.join(UPLOADS_DIR, 'CONTRACHEQUES')
FOTOS_DIR = os.path.join(UPLOADS_DIR, 'FOTOS')
PORT = int(os.environ.get('PORT', 8080))

def save_foto_base64(foto_b64_str, identifier=''):
    if not foto_b64_str or not isinstance(foto_b64_str, str):
        return None
    if foto_b64_str == 'REMOVE':
        return ''

    if ',' in foto_b64_str:
        header, data = foto_b64_str.split(',', 1)
    else:
        header, data = '', foto_b64_str

    ext = 'jpg'
    if 'image/png' in header:
        ext = 'png'
    elif 'image/webp' in header:
        ext = 'webp'
    elif 'image/gif' in header:
        ext = 'gif'

    os.makedirs(FOTOS_DIR, exist_ok=True)
    clean_id = re.sub(r'[^a-zA-Z0-9_-]', '_', str(identifier)) if identifier else 'novo'
    ts = int(datetime.datetime.now().timestamp())
    filename = f"foto_{clean_id}_{ts}.{ext}"
    filepath = os.path.join(FOTOS_DIR, filename)

    try:
        img_bytes = base64.b64decode(data)
        with open(filepath, 'wb') as f:
            f.write(img_bytes)
        return f"UPLOADS/FOTOS/{filename}"
    except Exception as e:
        print(f"Erro ao salvar foto base64: {e}")
        return None

def resolve_media_path(rel_path):
    p1 = os.path.join(BASE_DIR, rel_path)
    if os.path.exists(p1):
        return p1
    p2 = os.path.join(PARENT_DIR, rel_path)
    if os.path.exists(p2):
        return p2
    return p1

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricula TEXT,
        nome TEXT NOT NULL,
        cpf TEXT,
        rg TEXT,
        data_nascimento TEXT,
        cargo TEXT,
        admissao TEXT,
        demissao TEXT,
        status TEXT DEFAULT 'Ativo',
        valor_hora REAL DEFAULT 0,
        salario_funcao REAL DEFAULT 0,
        premio_assiduidade REAL DEFAULT 0,
        salario_bruto REAL DEFAULT 0,
        salario REAL DEFAULT 0,
        local_trabalho TEXT DEFAULT 'Geral',
        rua TEXT,
        numero TEXT,
        bairro TEXT,
        cidade TEXT,
        cep TEXT,
        telefone TEXT,
        banco TEXT,
        agencia TEXT,
        conta TEXT,
        pix TEXT,
        foto_path TEXT,
        observacoes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS atestados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        data_inicio TEXT NOT NULL,
        dias_afastamento INTEGER DEFAULT 1,
        data_retorno TEXT,
        medico_crm TEXT,
        cid TEXT,
        motivo TEXT,
        anexo_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS horas_extras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        percentual TEXT DEFAULT '50%',
        quantidade_horas REAL NOT NULL,
        motivo TEXT,
        valor_calculado REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS epis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        ca TEXT,
        quantidade INTEGER DEFAULT 1,
        descricao TEXT NOT NULL,
        data_entrega TEXT NOT NULL,
        data_devolucao TEXT,
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS ferias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        periodo_aquisitivo_inicio TEXT,
        periodo_aquisitivo_fim TEXT,
        periodo_concessivo_fim TEXT,
        data_inicio TEXT NOT NULL,
        dias INTEGER NOT NULL DEFAULT 30,
        data_retorno TEXT,
        abono_pecuniario INTEGER DEFAULT 0,
        dias_abono INTEGER DEFAULT 0,
        adiantamento_13 INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Agendada',
        observacoes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS contracheques (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        competencia TEXT NOT NULL,
        arquivo_path TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        tipo_arquivo TEXT DEFAULT 'application/pdf',
        tamanho_bytes INTEGER DEFAULT 0,
        valor_liquido REAL DEFAULT 0,
        observacoes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS usuarios_admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        senha_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    cursor.execute("PRAGMA table_info(funcionarios)")
    cols = [r['name'] for r in cursor.fetchall()]
    if 'senha_hash' not in cols:
        cursor.execute("ALTER TABLE funcionarios ADD COLUMN senha_hash TEXT")
    if 'senha_alterada' not in cols:
        cursor.execute("ALTER TABLE funcionarios ADD COLUMN senha_alterada INTEGER DEFAULT 0")

    # Garante usuário administrador padrão (admin / admin123)
    cursor.execute("SELECT COUNT(*) FROM usuarios_admin")
    if cursor.fetchone()[0] == 0:
        def_hash = hashlib.sha256(("SGP_ADMIN_SALT_2026" + "admin123").encode('utf-8')).hexdigest()
        cursor.execute('''
        INSERT INTO usuarios_admin (usuario, nome, senha_hash, role)
        VALUES (?, ?, ?, ?)
        ''', ('admin', 'Administrador', def_hash, 'admin'))

    conn.commit()
    conn.close()
    os.makedirs(CONTRACHEQUES_DIR, exist_ok=True)

# =========================================================================
# AUTH & ADMIN / PORTAL HELPERS
# =========================================================================
ADMIN_SESSIONS = {} # token -> {'admin_id': int, 'usuario': str, 'nome': str, 'role': str, 'expires_at': datetime}
PORTAL_SESSIONS = {} # token -> {'funcionario_id': int, 'expires_at': datetime}

def hash_admin_password(plain_pwd, salt="SGP_ADMIN_SALT_2026"):
    return hashlib.sha256((salt + str(plain_pwd).strip()).encode('utf-8')).hexdigest()

def create_admin_session(admin_dict):
    token = secrets.token_hex(32)
    expires = datetime.datetime.now() + datetime.timedelta(days=7)
    ADMIN_SESSIONS[token] = {
        'admin_id': admin_dict['id'],
        'usuario': admin_dict['usuario'],
        'nome': admin_dict['nome'],
        'role': admin_dict.get('role', 'admin'),
        'expires_at': expires
    }
    return token

def get_admin_session_user(handler):
    auth = handler.headers.get('Authorization', '')
    token = None
    if auth.startswith('Bearer '):
        token = auth[7:].strip()
    if not token:
        cookie_header = handler.headers.get('Cookie', '')
        if 'sgp_admin_token=' in cookie_header:
            match = re.search(r'sgp_admin_token=([a-f0-9]+)', cookie_header)
            if match:
                token = match.group(1)
    if not token:
        parsed = urllib.parse.urlparse(handler.path)
        qs = urllib.parse.parse_qs(parsed.query)
        token = qs.get('admin_token', [None])[0]

    if not token or token not in ADMIN_SESSIONS:
        return None

    sess = ADMIN_SESSIONS[token]
    if datetime.datetime.now() > sess['expires_at']:
        del ADMIN_SESSIONS[token]
        return None
    return sess

def hash_password(plain_pwd, salt="SGP_SANTOS_PORTAL_2026"):
    return hashlib.sha256((salt + str(plain_pwd).strip()).encode('utf-8')).hexdigest()

def get_default_password(emp):
    """
    Regra padrão de primeiro acesso: Primeiros 4 dígitos do CPF limpo.
    Caso não tenha CPF, utiliza os primeiros 4 dígitos da matrícula ou '1234'.
    """
    cpf = re.sub(r'\D', '', str(emp['cpf'] or ''))
    if len(cpf) >= 4:
        return cpf[:4]
    mat = re.sub(r'\D', '', str(emp['matricula'] or ''))
    if len(mat) >= 4:
        return mat[:4]
    return '1234'

def verify_employee_password(emp, plain_pwd):
    plain_pwd = str(plain_pwd or '').strip()
    if not plain_pwd:
        return False
    senha_hash = emp['senha_hash']
    if senha_hash:
        return hash_password(plain_pwd) == senha_hash
    else:
        return plain_pwd == get_default_password(emp)

def create_portal_session(funcionario_id):
    token = secrets.token_hex(24)
    expires = datetime.datetime.now() + datetime.timedelta(days=14)
    PORTAL_SESSIONS[token] = {
        'funcionario_id': funcionario_id,
        'expires_at': expires
    }
    return token

def get_portal_session_user(handler):
    auth = handler.headers.get('Authorization', '')
    token = None
    if auth.startswith('Bearer '):
        token = auth[7:].strip()
    if not token:
        parsed = urllib.parse.urlparse(handler.path)
        qs = urllib.parse.parse_qs(parsed.query)
        token = qs.get('token', [None])[0]
    
    if not token or token not in PORTAL_SESSIONS:
        return None
    
    sess = PORTAL_SESSIONS[token]
    if datetime.datetime.now() > sess['expires_at']:
        del PORTAL_SESSIONS[token]
        return None
    return sess['funcionario_id']

# =========================================================================
# MOTOR DE CONCILIAÇÃO INTELIGENTE DE CONTRACHEQUES EM LOTE
# =========================================================================
NOISE_TOKENS = {
    'CONTRACHEQUE', 'CONTRACHEQUES', 'HOLERITE', 'HOLERITES', 'RECIBO', 'RECIBOS',
    'FOLHA', 'PAGAMENTO', 'SALARIO', 'MENSAL', 'COMPROVANTE', 'COMPROVANTES',
    'SANTOS', 'MANUTENCAO', 'PDF', 'JPEG', 'JPG', 'PNG', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E',
    'ATESTADO', 'ATESTADOS', 'ASO', 'TERMO', 'COMPETENCIA', 'REF', 'MES', 'ANO'
}

def normalizar_texto(texto):
    if not texto:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(texto))
    sem_acento = "".join([c for c in nfkd if not unicodedata.combining(c)])
    limpo = re.sub(r'[^a-zA-Z0-9]', ' ', sem_acento)
    return ' '.join(limpo.upper().split())

def extrair_tokens_significativos(texto):
    norm = normalizar_texto(texto)
    tokens = norm.split()
    return [t for t in tokens if len(t) > 1 and t not in NOISE_TOKENS and not t.isdigit()]

def casar_arquivo_com_colaborador(nome_arquivo, colaboradores):
    """
    Identifica o colaborador pelo nome do arquivo PDF.
    Prioriza a correspondência pelo primeiro nome do colaborador contido no arquivo.
    Retorna: (colaborador_id, colaborador_nome, confianca, status, motivo)
    status: 'EXATO' (1.0), 'PROVAVEL' (0.7+), 'NENHUM' (0.0)
    """
    nome_sem_ext, _ = os.path.splitext(nome_arquivo)
    norm_arq = normalizar_texto(nome_sem_ext)
    tokens_arq = extrair_tokens_significativos(nome_sem_ext)
    set_tokens_arq = set(tokens_arq)
    numeros_arq = set(re.findall(r'\d+', nome_arquivo))

    # 1. Checagem por CPF completo no nome do arquivo (ex: 08478076654)
    for c in colaboradores:
        cpf_limpo = re.sub(r'\D', '', str(c.get('cpf') or ''))
        if len(cpf_limpo) == 11 and cpf_limpo in nome_arquivo.replace('.', '').replace('-', ''):
            return c['id'], c['nome'], 1.0, 'EXATO', 'Identificado por CPF no arquivo'

    # 2. Checagem por Matrícula
    for c in colaboradores:
        mat = str(c.get('matricula') or '').strip()
        if mat and mat.isdigit() and len(mat) >= 2 and mat in numeros_arq:
            c_tokens = extrair_tokens_significativos(c['nome'])
            if c_tokens and c_tokens[0] in set_tokens_arq:
                return c['id'], c['nome'], 1.0, 'EXATO', f'Identificado por Matrícula #{mat} + Primeiro Nome'

    # 3. Correspondência de Nome Completo
    for c in colaboradores:
        norm_nome = normalizar_texto(c['nome'])
        if norm_arq == norm_nome or norm_nome in norm_arq:
            return c['id'], c['nome'], 1.0, 'EXATO', 'Nome completo correspondente'

    # 4. Checagem pelo PRIMEIRO NOME do colaborador (Regra de ouro solicitada pelo usuário)
    candidatos_primeiro_nome = []
    for c in colaboradores:
        c_tokens = [t for t in normalizar_texto(c['nome']).split() if t not in NOISE_TOKENS]
        if not c_tokens:
            continue
        p_nome = c_tokens[0]
        # Se o primeiro nome do colaborador está entre os tokens do arquivo ou na string normalizada
        if p_nome in set_tokens_arq or p_nome == norm_arq or f" {p_nome} " in f" {norm_arq} ":
            # Tokens extras que coincidem (segundo nome, sobrenome)
            outros_tokens_colab = set(c_tokens[1:])
            coincidentes = set_tokens_arq.intersection(outros_tokens_colab)
            candidatos_primeiro_nome.append({
                'colaborador': c,
                'primeiro_nome': p_nome,
                'tokens_extras_coincidentes': len(coincidentes),
                'lista_coincidentes': coincidentes
            })

    if candidatos_primeiro_nome:
        # Ordena candidatos que têm mais tokens extras coincidentes (ex: MARCOS HENRIQUE vs MARCOS VINICIUS)
        candidatos_primeiro_nome.sort(key=lambda x: x['tokens_extras_coincidentes'], reverse=True)
        melhor = candidatos_primeiro_nome[0]
        c_escolhido = melhor['colaborador']

        # Se houver apenas 1 colaborador com esse primeiro nome
        if len(candidatos_primeiro_nome) == 1:
            return c_escolhido['id'], c_escolhido['nome'], 1.0, 'EXATO', f"Identificado pelo primeiro nome '{melhor['primeiro_nome']}'"

        # Se tem tokens extras que diferenciam (ex: nome composto ou sobrenome presente no arquivo)
        segundo_melhor = candidatos_primeiro_nome[1]
        if melhor['tokens_extras_coincidentes'] > segundo_melhor['tokens_extras_coincidentes']:
            return c_escolhido['id'], c_escolhido['nome'], 1.0, 'EXATO', f"Identificado por '{melhor['primeiro_nome']}' + sobrenome"

        # Múltiplos colaboradores com exatamente o mesmo primeiro nome sem token de desempate no arquivo
        nomes_conflito = ", ".join([x['colaborador']['nome'].split()[0] + " " + x['colaborador']['nome'].split()[-1] for x in candidatos_primeiro_nome[:3]])
        return c_escolhido['id'], c_escolhido['nome'], 0.75, 'PROVAVEL', f"Primeiro nome '{melhor['primeiro_nome']}' comum a: {nomes_conflito} (confirme na seleção)"

    # 5. Se o nome do arquivo estiver contido no nome do colaborador (ex: apelido ou abreviação com 4+ letras)
    if norm_arq and len(norm_arq) >= 4:
        for c in colaboradores:
            norm_nome = normalizar_texto(c['nome'])
            if norm_arq in norm_nome:
                return c['id'], c['nome'], 0.95, 'EXATO', 'Nome contido no cadastro do colaborador'

    # 6. Tokens compartilhados de sobrenome
    melhor_match = None
    melhor_score = 0.0
    for c in colaboradores:
        c_tokens = set(extrair_tokens_significativos(c['nome']))
        comuns = set_tokens_arq.intersection(c_tokens)
        if comuns:
            score = len(comuns) / len(c_tokens)
            if score > melhor_score and score >= 0.4:
                melhor_score = score
                melhor_match = c

    if melhor_match:
        return melhor_match['id'], melhor_match['nome'], round(melhor_score, 2), 'PROVAVEL', f"Correspondência por palavras ({int(melhor_score*100)}%)"

    return None, None, 0.0, 'NENHUM', 'Colaborador não identificado automaticamente'

# CLT Vacation Calculation Engine
def add_years(d, years):
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)

def parse_date(d_str):
    if not d_str:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.datetime.strptime(str(d_str).strip()[:10], fmt).date()
        except ValueError:
            pass
    return None

def calcular_ferias_colaborador(admissao_val, lista_ferias=None, ref_date=None):
    if lista_ferias is None:
        lista_ferias = []
    if ref_date is None:
        ref_date = datetime.date.today()

    adm = parse_date(admissao_val)
    if not adm:
        return {
            'status': 'SEM_DATA',
            'status_label': 'Sem Admissão',
            'badge_class': 'bg-slate-100 text-slate-600 border-slate-200',
            'alerta_texto': 'Data de admissão não informada para cálculo das férias.',
            'ciclos': [],
            'proxima_data_limite': None,
            'dias_restantes_menor': None,
            'em_gozo_registro': None,
            'proxima_ferias': None
        }

    ferias_clean = []
    for f in lista_ferias:
        d_ini = parse_date(f.get('data_inicio') if isinstance(f, dict) else f['data_inicio'])
        if not d_ini:
            continue
        dias = int((f.get('dias') if isinstance(f, dict) else f['dias']) or 30)
        d_ret = parse_date(f.get('data_retorno') if isinstance(f, dict) else f['data_retorno'])
        if not d_ret:
            d_ret = d_ini + datetime.timedelta(days=dias)
        abono = int((f.get('abono_pecuniario') if isinstance(f, dict) else f['abono_pecuniario']) or 0)
        dias_abono = int((f.get('dias_abono') if isinstance(f, dict) else f['dias_abono']) or (10 if abono else 0))
        d_pa_ini = parse_date(f.get('periodo_aquisitivo_inicio') if isinstance(f, dict) else f['periodo_aquisitivo_inicio'])

        f_status = (f.get('status') if isinstance(f, dict) else f['status']) or 'Agendada'
        if f_status != 'Cancelada':
            if f_status in ('Concluída', 'Gozada'):
                f_status = 'Concluída'
            elif d_ini <= ref_date <= d_ret:
                f_status = 'Em Gozo'
            elif d_ret < ref_date:
                f_status = 'Concluída'
            elif d_ini > ref_date:
                f_status = 'Agendada'

        ferias_clean.append({
            'id': f.get('id') if isinstance(f, dict) else f['id'],
            'data_inicio': d_ini,
            'data_inicio_str': d_ini.strftime('%Y-%m-%d'),
            'data_inicio_br': d_ini.strftime('%d/%m/%Y'),
            'dias': dias,
            'data_retorno': d_ret,
            'data_retorno_str': d_ret.strftime('%Y-%m-%d'),
            'data_retorno_br': d_ret.strftime('%d/%m/%Y'),
            'abono_pecuniario': abono,
            'dias_abono': dias_abono,
            'total_dias_consumidos': dias + dias_abono,
            'adiantamento_13': int((f.get('adiantamento_13') if isinstance(f, dict) else f['adiantamento_13']) or 0),
            'periodo_aquisitivo_inicio': d_pa_ini,
            'status': f_status,
            'observacoes': (f.get('observacoes') if isinstance(f, dict) else f['observacoes']) or ''
        })

    ferias_clean.sort(key=lambda x: x['data_inicio'])

    # Build CLT Cycles
    ciclos = []
    i = 0
    while True:
        pa_ini = add_years(adm, i)
        if pa_ini > ref_date:
            break
        pa_fim = add_years(adm, i + 1) - datetime.timedelta(days=1)
        pc_ini = pa_fim + datetime.timedelta(days=1)
        pc_fim = add_years(pc_ini, 1) - datetime.timedelta(days=1)

        ciclos.append({
            'ciclo_num': i + 1,
            'pa_inicio': pa_ini,
            'pa_inicio_str': pa_ini.strftime('%Y-%m-%d'),
            'pa_inicio_br': pa_ini.strftime('%d/%m/%Y'),
            'pa_fim': pa_fim,
            'pa_fim_str': pa_fim.strftime('%Y-%m-%d'),
            'pa_fim_br': pa_fim.strftime('%d/%m/%Y'),
            'pc_inicio': pc_ini,
            'pc_inicio_str': pc_ini.strftime('%Y-%m-%d'),
            'pc_inicio_br': pc_ini.strftime('%d/%m/%Y'),
            'pc_fim': pc_fim,
            'pc_fim_str': pc_fim.strftime('%Y-%m-%d'),
            'pc_fim_br': pc_fim.strftime('%d/%m/%Y'),
            'dias_direito': 30,
            'dias_gozados': 0,
            'dias_agendados': 0,
            'dias_abono': 0,
            'dias_saldo': 30,
            'status_ciclo': 'A_VENCER',
            'dias_para_vencer': (pc_fim - ref_date).days,
            'dias_vencido': max(0, (ref_date - pc_fim).days),
            'ferias_vinculadas': []
        })
        i += 1

    # Distribute vacations
    unassigned_ferias = []
    for f in ferias_clean:
        if f['status'] == 'Cancelada':
            continue
        assigned = False
        if f['periodo_aquisitivo_inicio']:
            for c in ciclos:
                if c['pa_inicio'] == f['periodo_aquisitivo_inicio']:
                    c['ferias_vinculadas'].append(f)
                    assigned = True
                    break
        if not assigned:
            unassigned_ferias.append(f)

    for f in unassigned_ferias:
        for c in ciclos:
            consumidos_ciclo = sum(item['total_dias_consumidos'] for item in c['ferias_vinculadas'])
            if consumidos_ciclo < 30:
                c['ferias_vinculadas'].append(f)
                break

    tem_vencida = False
    tem_risco_dobra = False
    proxima_data_limite = None
    menor_dias_restantes = 999999

    for c in ciclos:
        dias_goz = 0
        dias_agend = 0
        dias_ab = 0
        for f in c['ferias_vinculadas']:
            dias_ab += f['dias_abono']
            if f['status'] in ('Concluída', 'Em Gozo'):
                dias_goz += f['dias']
            elif f['status'] == 'Agendada':
                dias_agend += f['dias']

        c['dias_gozados'] = dias_goz
        c['dias_agendados'] = dias_agend
        c['dias_abono'] = dias_ab
        saldo = max(0, 30 - (dias_goz + dias_agend + dias_ab))
        c['dias_saldo'] = saldo

        if ref_date < c['pa_fim']:
            c['status_ciclo'] = 'EM_AQUISICAO'
            c['status_ciclo_label'] = 'Em Aquisição'
            c['badge_class'] = 'bg-slate-100 text-slate-700 border-slate-200'
        elif saldo == 0:
            c['status_ciclo'] = 'QUITADA'
            c['status_ciclo_label'] = 'Quitada / Agendada'
            c['badge_class'] = 'bg-emerald-100 text-emerald-800 border-emerald-300'
        else:
            if ref_date > c['pc_fim']:
                c['status_ciclo'] = 'VENCIDA'
                c['status_ciclo_label'] = f"VENCIDA (Dobra há {c['dias_vencido']}d)"
                c['badge_class'] = 'bg-rose-100 text-rose-800 border-rose-300 font-bold'
                tem_vencida = True
                if not proxima_data_limite or c['pc_fim'] < proxima_data_limite:
                    proxima_data_limite = c['pc_fim']
                    menor_dias_restantes = c['dias_para_vencer']
            else:
                dias_rest = c['dias_para_vencer']
                if dias_rest <= 60:
                    c['status_ciclo'] = 'RISCO_DOBRAR'
                    c['status_ciclo_label'] = f"Risco Dobra ({dias_rest}d)"
                    c['badge_class'] = 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
                    tem_risco_dobra = True
                else:
                    c['status_ciclo'] = 'A_VENCER'
                    c['status_ciclo_label'] = f"No Prazo ({dias_rest}d)"
                    c['badge_class'] = 'bg-blue-100 text-blue-800 border-blue-300'

                if menor_dias_restantes == 999999 or dias_rest < menor_dias_restantes:
                    menor_dias_restantes = dias_rest
                    proxima_data_limite = c['pc_fim']

    em_gozo_reg = next((f for f in ferias_clean if f['status'] == 'Em Gozo'), None)
    proxima_ferias = next((f for f in ferias_clean if f['status'] == 'Agendada' and f['data_inicio'] > ref_date), None)

    if tem_vencida:
        status = 'VENCIDA'
        status_label = '🚨 Férias Vencidas (Dobra CLT)'
        badge_class = 'bg-rose-600 text-white font-bold shadow-sm'
        alerta_texto = 'Atenção Crítica: O colaborador possui férias vencidas que ultrapassaram o período concessivo legal (Art. 137 da CLT - Sujeito a Pagamento em Dobro).'
    elif tem_risco_dobra:
        status = 'RISCO_DOBRAR'
        status_label = f'⚠️ Risco de Dobra ({menor_dias_restantes}d)'
        badge_class = 'bg-amber-500 text-white font-semibold shadow-sm'
        alerta_texto = f'Alerta Preventivo: Faltam {menor_dias_restantes} dias para o término do período concessivo. Agende as férias para evitar a dobra legal.'
    elif em_gozo_reg:
        status = 'EM_GOZO'
        status_label = f'🏖️ Em Gozo (até {em_gozo_reg["data_retorno_br"]})'
        badge_class = 'bg-purple-600 text-white font-semibold shadow-sm'
        alerta_texto = f'Colaborador em período de férias de {em_gozo_reg["data_inicio_br"]} até {em_gozo_reg["data_retorno_br"]}.'
    elif proxima_ferias:
        status = 'AGENDADA'
        status_label = f'📅 Agendada ({proxima_ferias["data_inicio_br"]})'
        badge_class = 'bg-cyan-600 text-white font-semibold shadow-sm'
        alerta_texto = f'Férias agendadas com início em {proxima_ferias["data_inicio_br"]} e retorno em {proxima_ferias["data_retorno_br"]}.'
    elif menor_dias_restantes != 999999 and menor_dias_restantes > 60:
        status = 'A_VENCER'
        status_label = f'🟡 No Prazo ({menor_dias_restantes}d)'
        badge_class = 'bg-sky-100 text-sky-800 border border-sky-300 font-medium'
        alerta_texto = f'Período aquisitivo completo. Prazo concessivo regular (restam {menor_dias_restantes} dias).'
    else:
        status = 'EM_DIA'
        status_label = '🟢 Em Dia'
        badge_class = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-medium'
        alerta_texto = 'Férias regulares. Período aquisitivo atual em andamento.'

    ciclos_serializable = []
    for c in ciclos:
        c_dict = dict(c)
        c_dict['pa_inicio'] = c_dict['pa_inicio_str']
        c_dict['pa_fim'] = c_dict['pa_fim_str']
        c_dict['pc_inicio'] = c_dict['pc_inicio_str']
        c_dict['pc_fim'] = c_dict['pc_fim_str']
        c_dict['ferias_vinculadas'] = [
            {
                'id': vf.get('id'),
                'data_inicio': vf['data_inicio_str'],
                'data_inicio_br': vf['data_inicio_br'],
                'data_retorno': vf['data_retorno_str'],
                'data_retorno_br': vf['data_retorno_br'],
                'dias': vf['dias'],
                'abono_pecuniario': vf['abono_pecuniario'],
                'dias_abono': vf['dias_abono'],
                'adiantamento_13': vf.get('adiantamento_13', 0),
                'status': vf['status']
            }
            for vf in c_dict['ferias_vinculadas']
        ]
        ciclos_serializable.append(c_dict)

    return {
        'status': status,
        'status_label': status_label,
        'badge_class': badge_class,
        'alerta_texto': alerta_texto,
        'ciclos': ciclos_serializable,
        'proxima_data_limite': proxima_data_limite.strftime('%d/%m/%Y') if proxima_data_limite else None,
        'proxima_data_limite_iso': proxima_data_limite.strftime('%Y-%m-%d') if proxima_data_limite else None,
        'dias_restantes_menor': menor_dias_restantes if menor_dias_restantes != 999999 else None,
        'em_gozo_registro': em_gozo_reg,
        'proxima_ferias': proxima_ferias
    }

class SGPHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200, extra_headers=None):
        body = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            return {}
        raw = self.rfile.read(content_len)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def serve_file(self, full_path):
        full_path = os.path.normpath(full_path)
        if not os.path.isfile(full_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'File Not Found')
            return

        mime_type, _ = mimetypes.guess_type(full_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        try:
            with open(full_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'Error reading file: {e}'.encode('utf-8'))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        path_lower = path.lower()

        # Static assets
        if path == '/' or path == '/index.html':
            self.serve_file(os.path.join(STATIC_DIR, 'index.html'))
            return
        elif path in ('/portal', '/portal/', '/portal/index.html'):
            self.serve_file(os.path.join(STATIC_DIR, 'portal.html'))
            return
        elif path_lower.startswith('/static/'):
            rel_file = path[8:]
            self.serve_file(os.path.join(STATIC_DIR, rel_file))
            return
        elif path_lower.startswith('/uploads/'):
            rel = path[9:]
            target = os.path.join(UPLOADS_DIR, rel)
            if not os.path.isfile(target):
                target = os.path.join(BASE_DIR, path.lstrip('/'))
            self.serve_file(target)
            return
        elif path_lower.startswith('/fotos crachas/') or path_lower.startswith('/fotos/'):
            if path_lower.startswith('/fotos/'):
                target = resolve_media_path(os.path.join('FOTOS CRACHAS', path[7:]))
            else:
                target = resolve_media_path(path.lstrip('/'))
            self.serve_file(target)
            return
        elif path_lower.startswith(('/ativos/', '/atestados/', '/desligados/', '/documentos/')):
            target = resolve_media_path(path.lstrip('/'))
            self.serve_file(target)
            return

        # API Routes
        conn = get_db()
        cursor = conn.cursor()

        try:
            # Verificação de Sessão do Administrador
            if path == '/api/admin/me':
                admin = get_admin_session_user(self)
                if not admin:
                    self.send_json({'authenticated': False, 'error': 'Não autenticado como administrador'}, 401)
                    return
                self.send_json({
                    'authenticated': True,
                    'admin': {
                        'id': admin['admin_id'],
                        'usuario': admin['usuario'],
                        'nome': admin['nome'],
                        'role': admin['role']
                    }
                })
                return

            # Validação de Acesso Restrito para Rotas Administrativas
            if not path.startswith('/api/portal/'):
                admin = get_admin_session_user(self)
                if not admin:
                    is_cc_dl = re.match(r'^/api/contracheques/(\d+)/download$', path)
                    if not (is_cc_dl and get_portal_session_user(self)):
                        self.send_json({'error': 'Acesso restrito. Faça login como administrador.'}, 401)
                        return

            # Stats endpoint with Vacation metrics
            if path == '/api/stats':
                cursor.execute("SELECT COUNT(*) FROM funcionarios WHERE status = 'Ativo'")
                ativos = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM funcionarios WHERE status = 'Desligado'")
                desligados = cursor.fetchone()[0]

                today_str = datetime.date.today().strftime('%Y-%m-%d')
                cursor.execute('''
                    SELECT COUNT(DISTINCT funcionario_id) FROM atestados 
                    WHERE data_retorno >= ? OR data_inicio = ?
                ''', (today_str, today_str))
                em_atestado = cursor.fetchone()[0]

                cursor.execute("SELECT SUM(quantidade_horas) FROM horas_extras")
                total_he = cursor.fetchone()[0] or 0.0

                cursor.execute("SELECT SUM(salario_funcao), SUM(premio_assiduidade), SUM(salario_bruto) FROM funcionarios WHERE status = 'Ativo'")
                row_sal = cursor.fetchone()
                total_sf = row_sal[0] or 0.0
                total_assid = row_sal[1] or 0.0
                total_bruto = row_sal[2] or 0.0

                cursor.execute("SELECT DISTINCT local_trabalho FROM funcionarios WHERE local_trabalho != '' AND LOWER(local_trabalho) != 'desligado' ORDER BY local_trabalho")
                locais = [r[0] for r in cursor.fetchall()]

                # Calculate vacation stats for active employees
                cursor.execute("SELECT id, admissao FROM funcionarios WHERE status = 'Ativo'")
                active_emps = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM ferias ORDER BY data_inicio ASC")
                all_ferias = [dict(r) for r in cursor.fetchall()]
                ferias_map = {}
                for f in all_ferias:
                    ferias_map.setdefault(f['funcionario_id'], []).append(f)

                vencidas_cnt = 0
                risco_cnt = 0
                gozo_cnt = 0
                agendadas_cnt = 0

                for emp in active_emps:
                    diag = calcular_ferias_colaborador(emp['admissao'], ferias_map.get(emp['id'], []))
                    if diag['status'] == 'VENCIDA':
                        vencidas_cnt += 1
                    elif diag['status'] == 'RISCO_DOBRAR':
                        risco_cnt += 1
                    elif diag['status'] == 'EM_GOZO':
                        gozo_cnt += 1
                    elif diag['status'] == 'AGENDADA':
                        agendadas_cnt += 1

                self.send_json({
                    'ativos': ativos,
                    'desligados': desligados,
                    'em_atestado': em_atestado,
                    'horas_extras': round(total_he, 1),
                    'salario_funcao_total': round(total_sf, 2),
                    'assiduidade_total': round(total_assid, 2),
                    'folha_estimada': round(total_bruto, 2),
                    'ferias_vencidas': vencidas_cnt,
                    'ferias_risco_dobra': risco_cnt,
                    'ferias_em_gozo': gozo_cnt,
                    'ferias_agendadas': agendadas_cnt,
                    'locais': locais
                })
                return

            # Distinct Locais & Cargos
            elif path == '/api/locais':
                cursor.execute("SELECT DISTINCT local_trabalho FROM funcionarios WHERE local_trabalho != '' AND LOWER(local_trabalho) != 'desligado' ORDER BY local_trabalho")
                locais = [r[0] for r in cursor.fetchall()]
                self.send_json(locais)
                return

            elif path == '/api/cargos':
                cursor.execute("SELECT DISTINCT cargo FROM funcionarios WHERE cargo != '' ORDER BY cargo")
                cargos = [r[0] for r in cursor.fetchall()]
                self.send_json(cargos)
                return

            # List Employees with vacation diagnostics and filtering
            elif path == '/api/funcionarios':
                q = query.get('q', [''])[0].strip()
                status = query.get('status', ['Ativo'])[0].strip()
                local = query.get('local', ['Todos'])[0].strip()
                ferias_filter = query.get('ferias_status', ['Todos'])[0].strip()

                sql = '''
                SELECT f.*,
                    (SELECT COUNT(*) FROM atestados a WHERE a.funcionario_id = f.id) as total_atestados,
                    (SELECT COUNT(*) FROM horas_extras h WHERE h.funcionario_id = f.id) as total_horas_extras,
                    (SELECT COUNT(*) FROM epis e WHERE e.funcionario_id = f.id) as total_epis,
                    (SELECT COUNT(*) FROM ferias fer WHERE fer.funcionario_id = f.id) as total_ferias,
                    (SELECT COUNT(*) FROM contracheques c WHERE c.funcionario_id = f.id) as total_contracheques,
                    (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM atestados a 
                     WHERE a.funcionario_id = f.id AND (a.data_retorno >= date('now') OR a.data_inicio = date('now'))) as em_atestado_agora
                FROM funcionarios f
                WHERE 1=1
                '''
                params = []

                if status and status != 'Todos':
                    sql += " AND f.status = ?"
                    params.append(status)

                if local and local != 'Todos':
                    sql += " AND f.local_trabalho = ?"
                    params.append(local)

                if q:
                    like_q = f'%{q}%'
                    sql += " AND (f.nome LIKE ? OR f.matricula LIKE ? OR f.cpf LIKE ? OR f.cargo LIKE ? OR f.cidade LIKE ?)"
                    params.extend([like_q, like_q, like_q, like_q, like_q])

                sql += " ORDER BY f.status ASC, f.nome ASC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]

                # Fetch all vacations for these employees
                cursor.execute("SELECT * FROM ferias ORDER BY data_inicio ASC")
                all_ferias = [dict(r) for r in cursor.fetchall()]
                ferias_map = {}
                for f in all_ferias:
                    ferias_map.setdefault(f['funcionario_id'], []).append(f)

                enriched = []
                for emp in rows:
                    emp['valor_hora'] = round(float(emp['valor_hora'] or 0.0), 2)
                    f_diag = calcular_ferias_colaborador(emp['admissao'], ferias_map.get(emp['id'], []))
                    emp['ferias_status'] = f_diag['status']
                    emp['ferias_label'] = f_diag['status_label']
                    emp['ferias_badge_class'] = f_diag['badge_class']
                    emp['ferias_alerta'] = f_diag['alerta_texto']
                    emp['ferias_limite'] = f_diag['proxima_data_limite']
                    emp['ferias_dias_limite'] = f_diag['dias_restantes_menor']

                    if ferias_filter and ferias_filter != 'Todos':
                        if ferias_filter == 'VENCIDA' and emp['ferias_status'] != 'VENCIDA':
                            continue
                        elif ferias_filter == 'RISCO_DOBRAR' and emp['ferias_status'] != 'RISCO_DOBRAR':
                            continue
                        elif ferias_filter == 'EM_GOZO' and emp['ferias_status'] != 'EM_GOZO':
                            continue
                        elif ferias_filter == 'AGENDADA' and emp['ferias_status'] != 'AGENDADA':
                            continue
                        elif ferias_filter == 'EM_DIA' and emp['ferias_status'] not in ('EM_DIA', 'A_VENCER', 'QUITADA'):
                            continue

                    enriched.append(emp)

                self.send_json(enriched)
                return

            # Single Employee with all relations
            match_emp = re.match(r'^/api/funcionarios/(\d+)$', path)
            if match_emp:
                emp_id = int(match_emp.group(1))
                cursor.execute("SELECT * FROM funcionarios WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    self.send_json({'error': 'Funcionário não encontrado'}, 404)
                    return
                emp_dict = dict(emp)
                emp_dict['valor_hora'] = round(float(emp_dict['valor_hora'] or 0.0), 2)

                cursor.execute("SELECT * FROM atestados WHERE funcionario_id = ? ORDER BY data_inicio DESC", (emp_id,))
                emp_dict['atestados'] = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM horas_extras WHERE funcionario_id = ? ORDER BY data DESC", (emp_id,))
                emp_dict['horas_extras'] = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM epis WHERE funcionario_id = ? ORDER BY data_entrega DESC", (emp_id,))
                emp_dict['epis'] = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM ferias WHERE funcionario_id = ? ORDER BY data_inicio DESC", (emp_id,))
                ferias_rows = [dict(r) for r in cursor.fetchall()]
                emp_dict['ferias'] = ferias_rows
                emp_dict['diagnostico_ferias'] = calcular_ferias_colaborador(emp_dict['admissao'], ferias_rows)

                self.send_json(emp_dict)
                return

            # Vacation Diagnostic and Records for a single employee
            match_emp_ferias = re.match(r'^/api/funcionarios/(\d+)/ferias$', path)
            if match_emp_ferias:
                emp_id = int(match_emp_ferias.group(1))
                cursor.execute("SELECT * FROM funcionarios WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    self.send_json({'error': 'Funcionário não encontrado'}, 404)
                    return

                cursor.execute("SELECT * FROM ferias WHERE funcionario_id = ? ORDER BY data_inicio DESC", (emp_id,))
                rows = [dict(r) for r in cursor.fetchall()]
                diag = calcular_ferias_colaborador(emp['admissao'], rows)

                self.send_json({
                    'funcionario': dict(emp),
                    'diagnostico': diag,
                    'historico': rows
                })
                return

            # Atestados list for single employee
            match_atest = re.match(r'^/api/funcionarios/(\d+)/atestados$', path)
            if match_atest:
                emp_id = int(match_atest.group(1))
                cursor.execute("SELECT * FROM atestados WHERE funcionario_id = ? ORDER BY data_inicio DESC", (emp_id,))
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)
                return

            # Horas Extras list for single employee
            match_he = re.match(r'^/api/funcionarios/(\d+)/horas-extras$', path)
            if match_he:
                emp_id = int(match_he.group(1))
                cursor.execute("SELECT * FROM horas_extras WHERE funcionario_id = ? ORDER BY data DESC", (emp_id,))
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)
                return

            # EPIs list for single employee
            match_epi = re.match(r'^/api/funcionarios/(\d+)/epis$', path)
            if match_epi:
                emp_id = int(match_epi.group(1))
                cursor.execute("SELECT * FROM epis WHERE funcionario_id = ? ORDER BY data_entrega DESC", (emp_id,))
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)
                return

            # Contracheques list for single employee (RH Admin)
            match_cc = re.match(r'^/api/funcionarios/(\d+)/contracheques$', path)
            if match_cc:
                emp_id = int(match_cc.group(1))
                cursor.execute("""
                    SELECT c.*, f.nome as funcionario_nome, f.cpf as funcionario_cpf, f.matricula as funcionario_matricula, f.senha_alterada
                    FROM contracheques c
                    JOIN funcionarios f ON f.id = c.funcionario_id
                    WHERE c.funcionario_id = ?
                    ORDER BY c.ano DESC, c.mes DESC, c.created_at DESC
                """, (emp_id,))
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)
                return

            # Contracheque download/view (RH Admin)
            match_cc_dl = re.match(r'^/api/contracheques/(\d+)/download$', path)
            if match_cc_dl:
                cc_id = int(match_cc_dl.group(1))
                cursor.execute("SELECT * FROM contracheques WHERE id = ?", (cc_id,))
                cc = cursor.fetchone()
                if not cc:
                    self.send_json({'error': 'Contracheque não encontrado'}, 404)
                    return
                full_path = os.path.join(BASE_DIR, cc['arquivo_path'])
                if not os.path.isfile(full_path):
                    self.send_json({'error': 'Arquivo físico não encontrado no servidor'}, 404)
                    return
                mime_type, _ = mimetypes.guess_type(full_path)
                if not mime_type:
                    mime_type = 'application/pdf' if cc['arquivo_path'].lower().endswith('.pdf') else 'application/octet-stream'
                try:
                    with open(full_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', mime_type)
                    disposition = 'inline' if 'inline' in query else 'attachment'
                    filename = cc['nome_arquivo'] or os.path.basename(full_path)
                    self.send_header('Content-Disposition', f'{disposition}; filename="{filename}"')
                    self.send_header('Content-Length', str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                except Exception as e:
                    self.send_json({'error': str(e)}, 500)
                return

            # Resumo da Competência de Contracheques (para gestão e exclusão em lote)
            if path == '/api/contracheques/resumo-competencia':
                try:
                    ano = int(query.get('ano', [datetime.date.today().year])[0])
                except (ValueError, IndexError):
                    ano = datetime.date.today().year
                try:
                    mes = int(query.get('mes', [datetime.date.today().month])[0])
                except (ValueError, IndexError):
                    mes = datetime.date.today().month

                cursor.execute("""
                    SELECT COUNT(*) as total, 
                           COUNT(DISTINCT funcionario_id) as total_funcionarios,
                           COALESCE(SUM(tamanho_bytes), 0) as total_bytes
                    FROM contracheques
                    WHERE ano = ? AND mes = ?
                """, (ano, mes))
                row = cursor.fetchone()

                nomes_meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º Salário']
                comp_nome = '13º Salário' if mes == 13 else (nomes_meses[mes] if 1 <= mes <= 12 else f"Mês {mes}")

                self.send_json({
                    'ano': ano,
                    'mes': mes,
                    'competencia_label': f"{comp_nome} / {ano}",
                    'total': row['total'] if row else 0,
                    'total_funcionarios': row['total_funcionarios'] if row else 0,
                    'total_bytes': row['total_bytes'] if row else 0
                })
                return


            # Portal do Colaborador: Meus Dados
            if path == '/api/portal/meus-dados':
                user_id = get_portal_session_user(self)
                if not user_id:
                    self.send_json({'error': 'Acesso não autorizado ou sessão expirada'}, 401)
                    return
                cursor.execute("SELECT * FROM funcionarios WHERE id = ?", (user_id,))
                emp = cursor.fetchone()
                if not emp:
                    self.send_json({'error': 'Colaborador não localizado'}, 404)
                    return
                emp_dict = dict(emp)
                emp_dict.pop('senha_hash', None)

                # Fetch vacations and diagnostic
                cursor.execute("SELECT * FROM ferias WHERE funcionario_id = ? ORDER BY data_inicio DESC", (user_id,))
                ferias_rows = [dict(r) for r in cursor.fetchall()]
                diag = calcular_ferias_colaborador(emp_dict['admissao'], ferias_rows)
                emp_dict['diagnostico_ferias'] = diag
                emp_dict['historico_ferias'] = ferias_rows

                # Fetch contracheques count
                cursor.execute("SELECT COUNT(*) FROM contracheques WHERE funcionario_id = ?", (user_id,))
                emp_dict['total_contracheques'] = cursor.fetchone()[0]

                self.send_json(emp_dict)
                return

            # Portal do Colaborador: Meus Contracheques
            if path == '/api/portal/meus-contracheques':
                user_id = get_portal_session_user(self)
                if not user_id:
                    self.send_json({'error': 'Acesso não autorizado ou sessão expirada'}, 401)
                    return
                cursor.execute("""
                    SELECT id, ano, mes, competencia, nome_arquivo, tipo_arquivo, tamanho_bytes, valor_liquido, observacoes, created_at
                    FROM contracheques
                    WHERE funcionario_id = ?
                    ORDER BY ano DESC, mes DESC, created_at DESC
                """, (user_id,))
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)
                return

            # Portal do Colaborador: Download/Visualizar Arquivo do Contracheque
            match_portal_file = re.match(r'^/api/portal/contracheques/(\d+)/arquivo$', path)
            if match_portal_file:
                user_id = get_portal_session_user(self)
                if not user_id:
                    self.send_json({'error': 'Acesso não autorizado'}, 401)
                    return
                cc_id = int(match_portal_file.group(1))
                cursor.execute("SELECT * FROM contracheques WHERE id = ? AND funcionario_id = ?", (cc_id, user_id))
                cc = cursor.fetchone()
                if not cc:
                    self.send_json({'error': 'Contracheque não encontrado ou acesso não permitido'}, 404)
                    return
                full_path = os.path.join(BASE_DIR, cc['arquivo_path'])
                if not os.path.isfile(full_path):
                    self.send_json({'error': 'Arquivo não localizado no servidor'}, 404)
                    return
                mime_type, _ = mimetypes.guess_type(full_path)
                if not mime_type:
                    mime_type = 'application/pdf' if cc['arquivo_path'].lower().endswith('.pdf') else 'application/octet-stream'
                try:
                    with open(full_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', mime_type)
                    filename = cc['nome_arquivo'] or os.path.basename(full_path)
                    disposition = 'inline' if 'inline' in query else 'attachment'
                    self.send_header('Content-Disposition', f'{disposition}; filename="{filename}"')
                    self.send_header('Content-Length', str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                except Exception as e:
                    self.send_json({'error': str(e)}, 500)
                return

            self.send_json({'error': 'Rota não encontrada'}, 404)
        finally:
            conn.close()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        conn = get_db()
        cursor = conn.cursor()

        try:
            # Login do Administrador
            if path == '/api/admin/login':
                usuario = str(body.get('usuario') or '').strip()
                senha = str(body.get('senha') or '').strip()
                if not usuario or not senha:
                    self.send_json({'error': 'Informe o usuário e senha de administrador'}, 400)
                    return

                cursor.execute("SELECT * FROM usuarios_admin WHERE LOWER(usuario) = LOWER(?)", (usuario,))
                admin_row = cursor.fetchone()
                if not admin_row:
                    self.send_json({'error': 'Usuário ou senha de administrador incorretos'}, 401)
                    return

                admin_dict = dict(admin_row)
                senha_hash = hash_admin_password(senha)
                if admin_dict['senha_hash'] != senha_hash:
                    self.send_json({'error': 'Usuário ou senha de administrador incorretos'}, 401)
                    return

                token = create_admin_session(admin_dict)
                cookie_val = f"sgp_admin_token={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"
                self.send_json({
                    'token': token,
                    'admin': {
                        'id': admin_dict['id'],
                        'usuario': admin_dict['usuario'],
                        'nome': admin_dict['nome'],
                        'role': admin_dict.get('role', 'admin')
                    },
                    'message': 'Login administrativo realizado com sucesso!'
                }, 200, extra_headers={'Set-Cookie': cookie_val})
                return

            # Logout do Administrador
            if path == '/api/admin/logout':
                auth = self.headers.get('Authorization', '')
                token = auth[7:].strip() if auth.startswith('Bearer ') else None
                if not token:
                    cookie_header = self.headers.get('Cookie', '')
                    if 'sgp_admin_token=' in cookie_header:
                        match = re.search(r'sgp_admin_token=([a-f0-9]+)', cookie_header)
                        if match:
                            token = match.group(1)
                if token and token in ADMIN_SESSIONS:
                    del ADMIN_SESSIONS[token]

                cookie_clear = "sgp_admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
                self.send_json({'message': 'Logout realizado com sucesso!'}, 200, extra_headers={'Set-Cookie': cookie_clear})
                return

            # Alterar Senha do Administrador
            if path == '/api/admin/alterar-senha':
                admin = get_admin_session_user(self)
                if not admin:
                    self.send_json({'error': 'Sessão expirada ou não autorizada'}, 401)
                    return

                senha_atual = str(body.get('senha_atual') or '').strip()
                nova_senha = str(body.get('nova_senha') or '').strip()

                if len(nova_senha) < 4:
                    self.send_json({'error': 'A nova senha deve ter no mínimo 4 caracteres'}, 400)
                    return

                cursor.execute("SELECT * FROM usuarios_admin WHERE id = ?", (admin['admin_id'],))
                adm = cursor.fetchone()
                if not adm:
                    self.send_json({'error': 'Usuário administrador não encontrado'}, 404)
                    return

                if dict(adm)['senha_hash'] != hash_admin_password(senha_atual):
                    self.send_json({'error': 'A senha atual está incorreta'}, 400)
                    return

                novo_hash = hash_admin_password(nova_senha)
                cursor.execute("UPDATE usuarios_admin SET senha_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (novo_hash, admin['admin_id']))
                conn.commit()
                self.send_json({'message': 'Senha de administrador alterada com sucesso!'})
                return

            # Validação de Administrador para as demais rotas administrativas
            if not path.startswith('/api/portal/'):
                admin = get_admin_session_user(self)
                if not admin:
                    self.send_json({'error': 'Acesso restrito. Faça login como administrador.'}, 401)
                    return

            # Reimport from Excel
            if path == '/api/reimportar':
                import import_excel
                import_excel.run_import()
                self.send_json({'message': 'Importação concluída com sucesso!'})
                return

            # Upload Employee Photo Endpoint
            if path == '/api/upload-foto':
                foto_b64 = body.get('foto_base64', '')
                emp_id = body.get('funcionario_id')
                nome = body.get('nome', '')
                ident = emp_id or nome or 'novo'
                if not foto_b64:
                    self.send_json({'error': 'Nenhuma imagem enviada'}, 400)
                    return
                if foto_b64 == 'REMOVE':
                    if emp_id:
                        cursor.execute('UPDATE funcionarios SET foto_path = "", updated_at = CURRENT_TIMESTAMP WHERE id = ?', (int(emp_id),))
                        conn.commit()
                    self.send_json({'success': True, 'foto_path': '', 'url': ''})
                    return
                rel_path = save_foto_base64(foto_b64, ident)
                if not rel_path:
                    self.send_json({'error': 'Falha ao processar arquivo de imagem'}, 500)
                    return
                if emp_id:
                    cursor.execute('UPDATE funcionarios SET foto_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (rel_path, int(emp_id)))
                    conn.commit()
                self.send_json({'success': True, 'foto_path': rel_path, 'url': '/' + rel_path})
                return

            # Create Employee
            if path == '/api/funcionarios':
                sal_funcao = float(body.get('salario_funcao') or body.get('salario') or 0.0)
                prem_assid = float(body.get('premio_assiduidade') or 0.0)
                # Salário bruto é RIGOROSAMENTE a soma do salário da função mais o prêmio de assiduidade
                sal_bruto = round(sal_funcao + prem_assid, 2)
                v_hora_raw = body.get('valor_hora')
                if v_hora_raw not in (None, '', 0, '0'):
                    try:
                        v_hora = round(float(v_hora_raw), 2)
                    except (ValueError, TypeError):
                        v_hora = round(sal_funcao / 220, 2) if sal_funcao > 0 else 0.0
                elif sal_funcao > 0:
                    v_hora = round(sal_funcao / 220, 2)
                else:
                    v_hora = 0.0

                foto_b64 = body.get('foto_base64', '')
                if foto_b64 and foto_b64 != 'REMOVE':
                    foto_path = save_foto_base64(foto_b64, body.get('nome', 'novo')) or ''
                else:
                    foto_path = body.get('foto_path', '')

                cursor.execute('''
                INSERT INTO funcionarios (
                    matricula, nome, cpf, rg, data_nascimento, cargo, admissao,
                    status, valor_hora, salario_funcao, premio_assiduidade, salario_bruto, salario, local_trabalho,
                    rua, numero, bairro, cidade, cep, telefone,
                    banco, agencia, conta, pix, foto_path, observacoes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    body.get('matricula', ''), body.get('nome', '').upper(), body.get('cpf', ''),
                    body.get('rg', ''), body.get('data_nascimento', ''), body.get('cargo', ''),
                    body.get('admissao', ''), body.get('status', 'Ativo'),
                    v_hora, sal_funcao, prem_assid, sal_bruto, sal_bruto,
                    body.get('local_trabalho', 'Geral'), body.get('rua', ''), body.get('numero', ''),
                    body.get('bairro', ''), body.get('cidade', ''), body.get('cep', ''),
                    body.get('telefone', ''), body.get('banco', ''), body.get('agencia', ''),
                    body.get('conta', ''), body.get('pix', ''), foto_path,
                    body.get('observacoes', '')
                ))
                new_id = cursor.lastrowid
                conn.commit()
                self.send_json({'id': new_id, 'message': 'Funcionário cadastrado com sucesso!'}, 201)
                return

            # Schedule Vacation (Agendar Férias)
            match_ferias = re.match(r'^/api/funcionarios/(\d+)/ferias$', path)
            if match_ferias:
                emp_id = int(match_ferias.group(1))
                dt_inicio = body.get('data_inicio', '')
                dias = int(body.get('dias') or 30)
                dt_retorno = body.get('data_retorno', '')
                abono = 1 if body.get('abono_pecuniario') else 0
                dias_abono = int(body.get('dias_abono') or (10 if abono else 0))
                adiantamento_13 = 1 if body.get('adiantamento_13') else 0

                if not dt_retorno and dt_inicio:
                    try:
                        d_obj = datetime.datetime.strptime(dt_inicio, '%Y-%m-%d').date()
                        dt_retorno = (d_obj + datetime.timedelta(days=dias)).strftime('%Y-%m-%d')
                    except Exception:
                        dt_retorno = dt_inicio

                today = datetime.date.today()
                v_status = body.get('status') or 'Agendada'
                try:
                    d_ini_obj = datetime.datetime.strptime(dt_inicio, '%Y-%m-%d').date()
                    d_ret_obj = datetime.datetime.strptime(dt_retorno, '%Y-%m-%d').date()
                    if body.get('status') in ('Concluída', 'Gozada'):
                        v_status = 'Concluída'
                    elif d_ini_obj <= today <= d_ret_obj:
                        v_status = 'Em Gozo'
                    elif d_ret_obj < today:
                        v_status = 'Concluída'
                except Exception:
                    pass

                cursor.execute('''
                INSERT INTO ferias (
                    funcionario_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
                    periodo_concessivo_fim, data_inicio, dias, data_retorno,
                    abono_pecuniario, dias_abono, adiantamento_13, status, observacoes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    emp_id,
                    body.get('periodo_aquisitivo_inicio', ''),
                    body.get('periodo_aquisitivo_fim', ''),
                    body.get('periodo_concessivo_fim', ''),
                    dt_inicio,
                    dias,
                    dt_retorno,
                    abono,
                    dias_abono,
                    adiantamento_13,
                    v_status,
                    body.get('observacoes', '')
                ))
                new_id = cursor.lastrowid
                conn.commit()
                self.send_json({'id': new_id, 'data_retorno': dt_retorno, 'status': v_status, 'message': 'Férias registradas com sucesso!'}, 201)
                return

            # Quitar Todas as Férias Vencidas de um Colaborador
            match_quitar = re.match(r'^/api/funcionarios/(\d+)/ferias/quitar-vencidas$', path)
            if match_quitar:
                emp_id = int(match_quitar.group(1))
                cursor.execute("SELECT * FROM funcionarios WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    self.send_json({'error': 'Colaborador não encontrado'}, 404)
                    return

                cursor.execute("SELECT * FROM ferias WHERE funcionario_id = ? ORDER BY data_inicio ASC", (emp_id,))
                ferias_rows = [dict(r) for r in cursor.fetchall()]

                diag = calcular_ferias_colaborador(emp['admissao'], ferias_rows)
                ciclos_vencidos = [c for c in diag['ciclos'] if c['status_ciclo'] == 'VENCIDA' and c['dias_saldo'] > 0]

                if not ciclos_vencidos:
                    self.send_json({'message': 'O colaborador não possui ciclos de férias vencidas com saldo pendente.', 'quitados': 0})
                    return

                quitados_count = 0
                for c in ciclos_vencidos:
                    dias = c['dias_saldo']
                    dt_ini = c['pc_inicio']
                    dt_ret = parse_date(dt_ini) + datetime.timedelta(days=dias)
                    dt_ret_str = dt_ret.strftime('%Y-%m-%d')
                    cursor.execute('''
                    INSERT INTO ferias (
                        funcionario_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
                        periodo_concessivo_fim, data_inicio, dias, data_retorno,
                        abono_pecuniario, dias_abono, adiantamento_13, status, observacoes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'Concluída', ?)
                    ''', (
                        emp_id,
                        c['pa_inicio'],
                        c['pa_fim'],
                        c['pc_fim'],
                        dt_ini,
                        dias,
                        dt_ret_str,
                        f"Férias já gozadas no período regular (baixa de saldo Ciclo #{c['ciclo_num']})"
                    ))
                    quitados_count += 1

                conn.commit()
                self.send_json({
                    'message': f"{quitados_count} ciclo(s) de férias vencidas foram quitados com sucesso e o saldo acumulado foi abatido!",
                    'quitados': quitados_count
                })
                return

            # Add Atestado
            match_atest = re.match(r'^/api/funcionarios/(\d+)/atestados$', path)
            if match_atest:
                emp_id = int(match_atest.group(1))
                dt_inicio = body.get('data_inicio', '')
                dias = int(body.get('dias_afastamento') or 1)
                dt_retorno = body.get('data_retorno', '')

                if not dt_retorno and dt_inicio:
                    try:
                        d_obj = datetime.datetime.strptime(dt_inicio, '%Y-%m-%d')
                        dt_retorno = (d_obj + datetime.timedelta(days=dias)).strftime('%Y-%m-%d')
                    except Exception:
                        dt_retorno = dt_inicio

                cursor.execute('''
                INSERT INTO atestados (
                    funcionario_id, data_inicio, dias_afastamento, data_retorno,
                    medico_crm, cid, motivo, anexo_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    emp_id, dt_inicio, dias, dt_retorno,
                    body.get('medico_crm', ''), body.get('cid', ''),
                    body.get('motivo', ''), body.get('anexo_path', '')
                ))
                new_id = cursor.lastrowid
                conn.commit()
                self.send_json({'id': new_id, 'message': 'Atestado registrado com sucesso!'}, 201)
                return

            # Add Horas Extras
            match_he = re.match(r'^/api/funcionarios/(\d+)/horas-extras$', path)
            if match_he:
                emp_id = int(match_he.group(1))
                horas = float(body.get('quantidade_horas') or 0.0)
                percentual = body.get('percentual', '50%')

                cursor.execute("SELECT valor_hora, salario_funcao FROM funcionarios WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                v_hora = emp['valor_hora'] if emp else 0.0
                if not v_hora and emp and emp['salario_funcao']:
                    v_hora = round(emp['salario_funcao'] / 220, 2)

                mult = 1.5 if '50' in percentual else (2.0 if '100' in percentual else 1.2)
                valor_calc = round(horas * v_hora * mult, 2)

                cursor.execute('''
                INSERT INTO horas_extras (
                    funcionario_id, data, percentual, quantidade_horas, motivo, valor_calculado
                ) VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    emp_id, body.get('data', ''), percentual, horas,
                    body.get('motivo', ''), valor_calc
                ))
                new_id = cursor.lastrowid
                conn.commit()
                self.send_json({'id': new_id, 'valor_calculado': valor_calc, 'message': 'Horas extras registradas!'}, 201)
                return

            # Add EPI
            match_epi = re.match(r'^/api/funcionarios/(\d+)/epis$', path)
            if match_epi:
                emp_id = int(match_epi.group(1))
                cursor.execute('''
                INSERT INTO epis (
                    funcionario_id, ca, quantidade, descricao, data_entrega, data_devolucao, observacao
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    emp_id, body.get('ca', ''), int(body.get('quantidade') or 1),
                    body.get('descricao', ''), body.get('data_entrega', ''),
                    body.get('data_devolucao', ''), body.get('observacao', '')
                ))
                new_id = cursor.lastrowid
                conn.commit()
                self.send_json({'id': new_id, 'message': 'EPI entregue registrado!'}, 201)
                return

            # Add Contracheque (RH Admin Upload)
            match_cc = re.match(r'^/api/funcionarios/(\d+)/contracheques$', path)
            if match_cc:
                emp_id = int(match_cc.group(1))
                ano = int(body.get('ano') or datetime.date.today().year)
                mes = int(body.get('mes') or datetime.date.today().month)
                competencia = body.get('competencia') or f"{mes:02d}/{ano}"
                nome_arq = body.get('nome_arquivo') or f"contracheque_{mes:02d}_{ano}.pdf"
                tipo_arq = body.get('tipo_arquivo') or ('application/pdf' if nome_arq.lower().endswith('.pdf') else 'image/jpeg')
                b64_data = body.get('arquivo_base64', '')
                valor_liq = float(body.get('valor_liquido') or 0.0)
                obs = body.get('observacoes', '')

                if not b64_data:
                    self.send_json({'error': 'Arquivo não enviado (conteúdo vazio)'}, 400)
                    return

                # Ensure base64 prefix is stripped if present
                if ',' in b64_data:
                    b64_data = b64_data.split(',', 1)[1]

                try:
                    file_bytes = base64.b64decode(b64_data)
                except Exception as e:
                    self.send_json({'error': f'Falha ao decodificar arquivo base64: {e}'}, 400)
                    return

                emp_dir = os.path.join(CONTRACHEQUES_DIR, str(emp_id))
                os.makedirs(emp_dir, exist_ok=True)

                safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', nome_arq)
                unique_name = f"{ano}_{mes:02d}_{secrets.token_hex(3)}_{safe_name}"
                dest_file = os.path.join(emp_dir, unique_name)

                with open(dest_file, 'wb') as f:
                    f.write(file_bytes)

                rel_path = os.path.relpath(dest_file, BASE_DIR).replace('\\', '/')

                cursor.execute('''
                INSERT INTO contracheques (
                    funcionario_id, ano, mes, competencia, arquivo_path,
                    nome_arquivo, tipo_arquivo, tamanho_bytes, valor_liquido, observacoes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    emp_id, ano, mes, competencia, rel_path,
                    nome_arq, tipo_arq, len(file_bytes), valor_liq, obs
                ))
                new_id = cursor.lastrowid
                conn.commit()
                self.send_json({'id': new_id, 'message': 'Contracheque anexado e disponibilizado ao colaborador com sucesso!'}, 201)
                return

            # Conciliação em Lote de Nomes de Arquivos
            if path == '/api/contracheques/conciliar-nomes':
                arquivos = body.get('arquivos', [])
                cursor.execute("""
                    SELECT id, nome, cpf, matricula, cargo, local_trabalho, status
                    FROM funcionarios
                    ORDER BY CASE WHEN status = 'Ativo' THEN 0 ELSE 1 END, nome ASC
                """)
                colaboradores = [dict(r) for r in cursor.fetchall()]

                resultados = []
                for item in arquivos:
                    nome_arq = item.get('nome', '') if isinstance(item, dict) else str(item)
                    tamanho = item.get('tamanho', 0) if isinstance(item, dict) else 0

                    c_id, c_nome, conf, status, motivo = casar_arquivo_com_colaborador(nome_arq, colaboradores)
                    cargo = ''
                    if c_id:
                        for c in colaboradores:
                            if c['id'] == c_id:
                                cargo = c.get('cargo', '')
                                break

                    resultados.append({
                        'nome_arquivo': nome_arq,
                        'tamanho': tamanho,
                        'colaborador_id': c_id,
                        'colaborador_nome': c_nome,
                        'cargo': cargo,
                        'confianca': conf,
                        'status': status,
                        'motivo': motivo
                    })

                self.send_json({
                    'total': len(arquivos),
                    'resultados': resultados,
                    'colaboradores': [
                        {
                            'id': c['id'],
                            'nome': c['nome'] + ('' if c.get('status') == 'Ativo' else ' [Desligado]'),
                            'cargo': c.get('cargo', '')
                        } for c in colaboradores
                    ]
                })
                return

            # Reset Password (RH Admin)
            match_reset = re.match(r'^/api/funcionarios/(\d+)/reset-senha$', path)
            if match_reset:
                emp_id = int(match_reset.group(1))
                cursor.execute("UPDATE funcionarios SET senha_hash = NULL, senha_alterada = 0 WHERE id = ?", (emp_id,))
                conn.commit()
                self.send_json({'message': 'Senha do colaborador redefinida para o padrão de primeiro acesso (4 primeiros dígitos do CPF).'})
                return

            # Portal: Login
            if path == '/api/portal/login':
                login = str(body.get('login') or '').strip()
                senha = str(body.get('senha') or '').strip()

                if not login or not senha:
                    self.send_json({'error': 'Informe seu CPF/matrícula e senha'}, 400)
                    return

                clean_login = re.sub(r'\D', '', login)

                # Busca pelo CPF limpo ou matrícula
                cursor.execute("""
                    SELECT * FROM funcionarios 
                    WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
                       OR matricula = ? 
                       OR TRIM(cpf) = ?
                """, (clean_login, login, login))
                emp = cursor.fetchone()

                if not emp and clean_login:
                    cursor.execute("SELECT * FROM funcionarios WHERE matricula = ?", (clean_login,))
                    emp = cursor.fetchone()

                if not emp:
                    self.send_json({'error': 'Colaborador não encontrado. Verifique seu CPF ou matrícula.'}, 401)
                    return

                emp_dict = dict(emp)

                if not verify_employee_password(emp_dict, senha):
                    self.send_json({'error': 'Senha incorreta. No primeiro acesso, informe os 4 primeiros dígitos do seu CPF.'}, 401)
                    return

                token = create_portal_session(emp_dict['id'])
                self.send_json({
                    'token': token,
                    'funcionario': {
                        'id': emp_dict['id'],
                        'nome': emp_dict['nome'],
                        'cpf': emp_dict['cpf'],
                        'matricula': emp_dict['matricula'],
                        'cargo': emp_dict['cargo'],
                        'local_trabalho': emp_dict['local_trabalho'],
                        'admissao': emp_dict['admissao'],
                        'senha_alterada': emp_dict['senha_alterada'] or 0
                    },
                    'message': 'Login realizado com sucesso!'
                })
                return

            # Portal: Alterar Senha
            if path == '/api/portal/alterar-senha':
                user_id = get_portal_session_user(self)
                if not user_id:
                    self.send_json({'error': 'Sessão expirada ou não autorizada'}, 401)
                    return

                senha_atual = str(body.get('senha_atual') or '').strip()
                nova_senha = str(body.get('nova_senha') or '').strip()

                if len(nova_senha) < 4:
                    self.send_json({'error': 'A nova senha deve ter no mínimo 4 caracteres'}, 400)
                    return

                cursor.execute("SELECT * FROM funcionarios WHERE id = ?", (user_id,))
                emp = cursor.fetchone()
                if not emp:
                    self.send_json({'error': 'Colaborador não encontrado'}, 404)
                    return

                emp_dict = dict(emp)
                if not verify_employee_password(emp_dict, senha_atual):
                    self.send_json({'error': 'A senha atual digitada está incorreta'}, 400)
                    return

                novo_hash = hash_password(nova_senha)
                cursor.execute("UPDATE funcionarios SET senha_hash = ?, senha_alterada = 1 WHERE id = ?", (novo_hash, user_id))
                conn.commit()
                self.send_json({'message': 'Senha pessoal atualizada com sucesso!'})
                return

            self.send_json({'error': 'Rota não encontrada'}, 404)
        finally:
            conn.close()

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        conn = get_db()
        cursor = conn.cursor()

        try:
            admin = get_admin_session_user(self)
            if not admin:
                self.send_json({'error': 'Acesso restrito. Faça login como administrador.'}, 401)
                return

            # Update Employee
            match_emp = re.match(r'^/api/funcionarios/(\d+)$', path)
            if match_emp:
                emp_id = int(match_emp.group(1))
                sal_funcao = float(body.get('salario_funcao') or body.get('salario') or 0.0)
                prem_assid = float(body.get('premio_assiduidade') or 0.0)
                # Salário bruto é RIGOROSAMENTE a soma do salário da função mais o prêmio de assiduidade
                sal_bruto = round(sal_funcao + prem_assid, 2)
                v_hora_raw = body.get('valor_hora')
                if v_hora_raw not in (None, '', 0, '0'):
                    try:
                        v_hora = round(float(v_hora_raw), 2)
                    except (ValueError, TypeError):
                        v_hora = round(sal_funcao / 220, 2) if sal_funcao > 0 else 0.0
                elif sal_funcao > 0:
                    v_hora = round(sal_funcao / 220, 2)
                else:
                    v_hora = 0.0

                foto_b64 = body.get('foto_base64', '')
                if foto_b64 == 'REMOVE':
                    foto_path = ''
                elif foto_b64 and foto_b64.startswith('data:image/'):
                    foto_path = save_foto_base64(foto_b64, emp_id) or ''
                else:
                    foto_path = body.get('foto_path', '')

                cursor.execute('''
                UPDATE funcionarios SET
                    matricula = ?, nome = ?, cpf = ?, rg = ?, data_nascimento = ?,
                    cargo = ?, admissao = ?, demissao = ?, status = ?,
                    valor_hora = ?, salario_funcao = ?, premio_assiduidade = ?, salario_bruto = ?, salario = ?, local_trabalho = ?,
                    rua = ?, numero = ?, bairro = ?, cidade = ?, cep = ?,
                    telefone = ?, banco = ?, agencia = ?, conta = ?, pix = ?,
                    foto_path = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                ''', (
                    body.get('matricula', ''), body.get('nome', '').upper(), body.get('cpf', ''),
                    body.get('rg', ''), body.get('data_nascimento', ''), body.get('cargo', ''),
                    body.get('admissao', ''), body.get('demissao', ''), body.get('status', 'Ativo'),
                    v_hora, sal_funcao, prem_assid, sal_bruto, sal_bruto,
                    body.get('local_trabalho', 'Geral'), body.get('rua', ''), body.get('numero', ''),
                    body.get('bairro', ''), body.get('cidade', ''), body.get('cep', ''),
                    body.get('telefone', ''), body.get('banco', ''), body.get('agencia', ''),
                    body.get('conta', ''), body.get('pix', ''), foto_path,
                    body.get('observacoes', ''), emp_id
                ))
                conn.commit()
                self.send_json({'message': 'Funcionário atualizado com sucesso!', 'foto_path': foto_path, 'url': ('/' + foto_path) if foto_path else ''})
                return

            # Update Vacation (Atualizar Férias)
            match_ferias = re.match(r'^/api/ferias/(\d+)$', path)
            if match_ferias:
                ferias_id = int(match_ferias.group(1))
                dt_inicio = body.get('data_inicio', '')
                dias = int(body.get('dias') or 30)
                dt_retorno = body.get('data_retorno', '')
                abono = 1 if body.get('abono_pecuniario') else 0
                dias_abono = int(body.get('dias_abono') or (10 if abono else 0))
                adiantamento_13 = 1 if body.get('adiantamento_13') else 0

                if not dt_retorno and dt_inicio:
                    try:
                        d_obj = datetime.datetime.strptime(dt_inicio, '%Y-%m-%d').date()
                        dt_retorno = (d_obj + datetime.timedelta(days=dias)).strftime('%Y-%m-%d')
                    except Exception:
                        dt_retorno = dt_inicio

                v_status = body.get('status', 'Agendada')
                cursor.execute('''
                UPDATE ferias SET
                    periodo_aquisitivo_inicio = ?, periodo_aquisitivo_fim = ?,
                    periodo_concessivo_fim = ?, data_inicio = ?, dias = ?, data_retorno = ?,
                    abono_pecuniario = ?, dias_abono = ?, adiantamento_13 = ?, status = ?,
                    observacoes = ?
                WHERE id = ?
                ''', (
                    body.get('periodo_aquisitivo_inicio', ''),
                    body.get('periodo_aquisitivo_fim', ''),
                    body.get('periodo_concessivo_fim', ''),
                    dt_inicio,
                    dias,
                    dt_retorno,
                    abono,
                    dias_abono,
                    adiantamento_13,
                    v_status,
                    body.get('observacoes', ''),
                    ferias_id
                ))
                conn.commit()
                self.send_json({'message': 'Férias atualizadas com sucesso!'})
                return

            self.send_json({'error': 'Rota não encontrada'}, 404)
        finally:
            conn.close()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        conn = get_db()
        cursor = conn.cursor()

        try:
            admin = get_admin_session_user(self)
            if not admin:
                self.send_json({'error': 'Acesso restrito. Faça login como administrador.'}, 401)
                return

            # Delete employee
            match_emp = re.match(r'^/api/funcionarios/(\d+)$', path)
            if match_emp:
                emp_id = int(match_emp.group(1))
                cursor.execute("DELETE FROM atestados WHERE funcionario_id = ?", (emp_id,))
                cursor.execute("DELETE FROM horas_extras WHERE funcionario_id = ?", (emp_id,))
                cursor.execute("DELETE FROM epis WHERE funcionario_id = ?", (emp_id,))
                cursor.execute("DELETE FROM ferias WHERE funcionario_id = ?", (emp_id,))
                cursor.execute("DELETE FROM funcionarios WHERE id = ?", (emp_id,))
                conn.commit()
                self.send_json({'message': 'Funcionário excluído!'})
                return

            # Delete vacation
            match_ferias = re.match(r'^/api/ferias/(\d+)$', path)
            if match_ferias:
                ferias_id = int(match_ferias.group(1))
                cursor.execute("DELETE FROM ferias WHERE id = ?", (ferias_id,))
                conn.commit()
                self.send_json({'message': 'Registro de férias excluído com sucesso!'})
                return

            # Delete atestado
            match_atest = re.match(r'^/api/atestados/(\d+)$', path)
            if match_atest:
                atest_id = int(match_atest.group(1))
                cursor.execute("DELETE FROM atestados WHERE id = ?", (atest_id,))
                conn.commit()
                self.send_json({'message': 'Atestado excluído!'})
                return

            # Delete hora extra
            match_he = re.match(r'^/api/horas-extras/(\d+)$', path)
            if match_he:
                he_id = int(match_he.group(1))
                cursor.execute("DELETE FROM horas_extras WHERE id = ?", (he_id,))
                conn.commit()
                self.send_json({'message': 'Horas extras excluídas!'})
                return

            # Delete epi
            match_epi = re.match(r'^/api/epis/(\d+)$', path)
            if match_epi:
                epi_id = int(match_epi.group(1))
                cursor.execute("DELETE FROM epis WHERE id = ?", (epi_id,))
                conn.commit()
                self.send_json({'message': 'EPI excluído!'})
                return

            # Delete contracheque
            match_cc = re.match(r'^/api/contracheques/(\d+)$', path)
            if match_cc:
                cc_id = int(match_cc.group(1))
                cursor.execute("SELECT arquivo_path FROM contracheques WHERE id = ?", (cc_id,))
                row = cursor.fetchone()
                if row and row['arquivo_path']:
                    full_f = os.path.join(BASE_DIR, row['arquivo_path'])
                    if os.path.isfile(full_f):
                        try:
                            os.remove(full_f)
                        except Exception:
                            pass
                cursor.execute("DELETE FROM contracheques WHERE id = ?", (cc_id,))
                conn.commit()
                self.send_json({'message': 'Contracheque excluído com sucesso!'})
                return

            # Delete contracheques em lote por competência (Ano e Mês) para todos os colaboradores
            if path == '/api/contracheques/em-lote':
                parsed_qs = urllib.parse.parse_qs(parsed.query)
                body = self.read_json_body()

                ano = 0
                mes = 0
                try:
                    ano = int(body.get('ano') or parsed_qs.get('ano', [0])[0] or 0)
                except (ValueError, TypeError):
                    pass
                try:
                    mes = int(body.get('mes') or parsed_qs.get('mes', [0])[0] or 0)
                except (ValueError, TypeError):
                    pass

                if not ano or not mes:
                    self.send_json({'error': 'Ano e mês são obrigatórios para exclusão em lote'}, 400)
                    return

                cursor.execute("SELECT id, funcionario_id, arquivo_path FROM contracheques WHERE ano = ? AND mes = ?", (ano, mes))
                registros = cursor.fetchall()
                total_encontrados = len(registros)

                arquivos_removidos = 0
                for r in registros:
                    arq_path = r['arquivo_path']
                    if arq_path:
                        full_f = os.path.join(BASE_DIR, arq_path)
                        if os.path.isfile(full_f):
                            try:
                                os.remove(full_f)
                                arquivos_removidos += 1
                            except Exception:
                                pass

                cursor.execute("DELETE FROM contracheques WHERE ano = ? AND mes = ?", (ano, mes))
                conn.commit()

                nomes_meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º Salário']
                comp_nome = '13º Salário' if mes == 13 else (nomes_meses[mes] if 1 <= mes <= 12 else f"Mês {mes}")

                self.send_json({
                    'message': f"{total_encontrados} contracheque(s) da competência {comp_nome} / {ano} excluídos com sucesso de todos os funcionários!",
                    'total_excluidos': total_encontrados,
                    'arquivos_deletados': arquivos_removidos,
                    'ano': ano,
                    'mes': mes
                })
                return

            self.send_json({'error': 'Rota não encontrada'}, 404)
        finally:
            conn.close()

def run_server():
    init_db()
    os.makedirs(STATIC_DIR, exist_ok=True)
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, SGPHandler)
    print(f"===========================================================")
    print(f"  SGP SANTOS MANUTENÇÃO - Servidor Iniciado!")
    print(f"  Diretório Base: {BASE_DIR}")
    print(f"  Acesse no navegador: http://localhost:{PORT}")
    print(f"===========================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor finalizado.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
