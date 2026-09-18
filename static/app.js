// SGP SANTOS MANUTENÇÃO - Lógica do Frontend
let debounceTimer;
let funcionarioAtualId = null;
let colaboradorAtualDocumento = null;
let tipoDocumentoAtual = 'uniforme';

// =========================================================================
// INTERCEPTADOR GLOBAL DE REQUISIÇÕES (AUTENTICAÇÃO DO ADMINISTRADOR)
// =========================================================================
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    const adminToken = localStorage.getItem('sgp_admin_token');

    const urlStr = typeof url === 'string' ? url : (url.url || '');
    if (adminToken && (urlStr.startsWith('/api/') || urlStr.includes(':8080/api/'))) {
        if (options.headers instanceof Headers) {
            if (!options.headers.has('Authorization')) {
                options.headers.set('Authorization', `Bearer ${adminToken}`);
            }
        } else if (Array.isArray(options.headers)) {
            if (!options.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
                options.headers.push(['Authorization', `Bearer ${adminToken}`]);
            }
        } else {
            if (!options.headers['Authorization'] && !options.headers['authorization']) {
                options.headers['Authorization'] = `Bearer ${adminToken}`;
            }
        }
    }

    const response = await originalFetch(url, options);

    // Se retornar 401 em rota protegida da API (e não for tentativa de login admin), expira sessão
    if (response.status === 401 && urlStr.startsWith('/api/') && !urlStr.includes('/api/admin/login') && !urlStr.includes('/api/portal/')) {
        console.warn('[SGP Auth] Sessão de administrador expirada ou inválida.');
        localStorage.removeItem('sgp_admin_token');
        localStorage.removeItem('sgp_admin_user');
        exibirTelaLoginAdmin();
    }

    return response;
};

// =========================================================================
// CONTROLE DE AUTENTICAÇÃO DO ADMINISTRADOR
// =========================================================================
let adminAtual = null;

function exibirTelaLoginAdmin() {
    const viewLogin = document.getElementById('viewLoginAdmin');
    const viewApp = document.getElementById('viewAppAdmin');
    if (viewLogin) viewLogin.classList.remove('hidden');
    if (viewApp) viewApp.classList.add('hidden');
    const inputUser = document.getElementById('loginAdminUsuario');
    if (inputUser) setTimeout(() => inputUser.focus(), 100);
}

function exibirAppAdmin() {
    const viewLogin = document.getElementById('viewLoginAdmin');
    const viewApp = document.getElementById('viewAppAdmin');
    if (viewLogin) viewLogin.classList.add('hidden');
    if (viewApp) viewApp.classList.remove('hidden');
}

async function verificarSessaoAdmin() {
    const token = localStorage.getItem('sgp_admin_token');
    if (!token) {
        exibirTelaLoginAdmin();
        return false;
    }
    try {
        const res = await originalFetch('/api/admin/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            adminAtual = data.admin;
            localStorage.setItem('sgp_admin_user', JSON.stringify(adminAtual));
            const elNome = document.getElementById('topbarAdminNome');
            if (elNome) elNome.textContent = adminAtual.nome || adminAtual.usuario;
            exibirAppAdmin();
            return true;
        } else {
            localStorage.removeItem('sgp_admin_token');
            localStorage.removeItem('sgp_admin_user');
            exibirTelaLoginAdmin();
            return false;
        }
    } catch (e) {
        console.error('[SGP Auth] Erro ao verificar sessão do administrador:', e);
        exibirTelaLoginAdmin();
        return false;
    }
}

async function realizarLoginAdmin(event) {
    event.preventDefault();
    const usuario = document.getElementById('loginAdminUsuario').value.trim();
    const senha = document.getElementById('loginAdminSenha').value.trim();
    const btn = document.getElementById('btnLoginAdminSubmit');
    const erroDiv = document.getElementById('loginAdminErro');
    const erroTexto = document.getElementById('loginAdminErroTexto');

    if (!usuario || !senha) return;

    erroDiv.classList.add('hidden');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Autenticando...';

    try {
        const res = await originalFetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        });
        const data = await res.json();

        if (res.ok && data.token) {
            localStorage.setItem('sgp_admin_token', data.token);
            localStorage.setItem('sgp_admin_user', JSON.stringify(data.admin));
            adminAtual = data.admin;

            const elNome = document.getElementById('topbarAdminNome');
            if (elNome) elNome.textContent = adminAtual.nome || adminAtual.usuario;

            exibirAppAdmin();
            carregarStats();
            carregarFuncionarios();
        } else {
            erroTexto.textContent = data.error || 'Credenciais inválidas. Verifique seu usuário e senha.';
            erroDiv.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Erro no login admin:', err);
        erroTexto.textContent = 'Falha ao conectar com o servidor. Verifique sua conexão.';
        erroDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

async function realizarLogoutAdmin() {
    if (!confirm('Deseja realmente encerrar a sessão de administrador?')) return;
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
    } catch (e) {
        console.error(e);
    }
    localStorage.removeItem('sgp_admin_token');
    localStorage.removeItem('sgp_admin_user');
    adminAtual = null;
    exibirTelaLoginAdmin();
}

function toggleVisibilidadeSenhaAdmin(id, btn) {
    const input = document.getElementById(id);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-solid fa-eye-slash text-sm"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-solid fa-eye text-sm"></i>';
    }
}

function abrirModalTrocarSenhaAdmin() {
    document.getElementById('formTrocarSenhaAdmin').reset();
    document.getElementById('erroTrocarSenhaAdmin').classList.add('hidden');
    abrirModal('modalTrocarSenhaAdmin');
}

function fecharModalTrocarSenhaAdmin() {
    fecharModal('modalTrocarSenhaAdmin');
}

async function salvarNovaSenhaAdmin(event) {
    event.preventDefault();
    const senhaAtual = document.getElementById('adminSenhaAtual').value.trim();
    const novaSenha = document.getElementById('adminNovaSenha').value.trim();
    const novaSenhaConf = document.getElementById('adminNovaSenhaConf').value.trim();
    const erroDiv = document.getElementById('erroTrocarSenhaAdmin');
    const btn = document.getElementById('btnSalvarSenhaAdmin');

    erroDiv.classList.add('hidden');

    if (novaSenha !== novaSenhaConf) {
        erroDiv.textContent = 'A nova senha e a confirmação não coincidem.';
        erroDiv.classList.remove('hidden');
        return;
    }

    if (novaSenha.length < 4) {
        erroDiv.textContent = 'A nova senha deve ter no mínimo 4 caracteres.';
        erroDiv.classList.remove('hidden');
        return;
    }

    const textoOrig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Salvando...';

    try {
        const res = await fetch('/api/admin/alterar-senha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Senha de administrador atualizada com sucesso!');
            fecharModal('modalTrocarSenhaAdmin');
        } else {
            erroDiv.textContent = data.error || 'Erro ao alterar a senha.';
            erroDiv.classList.remove('hidden');
        }
    } catch (err) {
        erroDiv.textContent = 'Erro ao conectar ao servidor.';
        erroDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOrig;
    }
}

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
    initFotoDragAndDrop();
    const autenticado = await verificarSessaoAdmin();
    if (autenticado) {
        carregarStats();
        carregarFuncionarios();
        verificarStatusSyncOnline();
    }
});

// =========================================================================
// CARREGAMENTO DE DADOS & METRICAS
// =========================================================================
async function carregarStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        document.getElementById('statAtivos').textContent = data.ativos;
        document.getElementById('statDesligados').textContent = data.desligados;
        document.getElementById('statAtestados').textContent = data.em_atestado;
        document.getElementById('statHorasExtras').textContent = `${data.horas_extras}h`;
        document.getElementById('statFolha').textContent = formatarMoeda(data.folha_estimada);
        const subAssid = document.getElementById('statSubAssiduidade');
        if (subAssid && data.assiduidade_total !== undefined) {
            subAssid.innerHTML = `<i class="fa-solid fa-gift mr-1"></i>Assid: ${formatarMoeda(data.assiduidade_total)}`;
        }

        // Férias Stats
        if (document.getElementById('statFeriasVencidas')) {
            document.getElementById('statFeriasVencidas').textContent = data.ferias_vencidas || 0;
        }
        if (document.getElementById('statFeriasRisco')) {
            document.getElementById('statFeriasRisco').innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i>${data.ferias_risco_dobra || 0} em risco`;
        }

        // Preenche o seletor de locais
        const selLocal = document.getElementById('filtroLocal');
        const localSelecionado = selLocal.value;
        selLocal.innerHTML = '<option value="Todos">📍 Todos os Locais</option>';
        data.locais.forEach(loc => {
            if (!loc || loc.toLowerCase() === 'desligado') return;
            const opt = document.createElement('option');
            opt.value = loc;
            opt.textContent = loc;
            if (loc === localSelecionado) opt.selected = true;
            selLocal.appendChild(opt);
        });
    } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
    }
}

function filtrarPorFeriasAlertas() {
    const sel = document.getElementById('filtroFerias');
    if (!sel) return;
    if (sel.value === 'VENCIDA') {
        sel.value = 'RISCO_DOBRAR';
    } else if (sel.value === 'RISCO_DOBRAR') {
        sel.value = 'Todos';
    } else {
        sel.value = 'VENCIDA';
    }
    carregarFuncionarios();
}

async function carregarFuncionarios() {
    const q = document.getElementById('searchInput').value.trim();
    const status = document.getElementById('filtroStatus').value;
    const local = document.getElementById('filtroLocal').value;
    const feriasStatus = document.getElementById('filtroFerias') ? document.getElementById('filtroFerias').value : 'Todos';

    const tbody = document.getElementById('tabelaFuncionarios');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="py-12 text-center text-slate-400">
                <i class="fa-solid fa-circle-notch fa-spin text-2xl text-blue-600 mb-2"></i>
                <p>Buscando colaboradores...</p>
            </td>
        </tr>
    `;

    try {
        const url = `/api/funcionarios?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&local=${encodeURIComponent(local)}&ferias_status=${encodeURIComponent(feriasStatus)}`;
        const res = await fetch(url);
        const funcionarios = await res.json();

        document.getElementById('contagemBadge').textContent = funcionarios.length;

        if (!funcionarios || funcionarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-10 text-center text-slate-400">
                        <i class="fa-solid fa-user-slash text-3xl mb-2 text-slate-300"></i>
                        <p class="font-medium">Nenhum colaborador encontrado com os filtros selecionados.</p>
                    </td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = funcionarios.map(f => {
            const nomeSeguro = f.nome || 'Colaborador';
            const iniciais = (nomeSeguro.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2) || 'FC').toUpperCase();
            const fotoUrl = getFotoUrl(f.foto_path);
            const fotoHtml = fotoUrl
                ? `<img src="${fotoUrl}" class="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-sm" onerror="this.onerror=null; this.outerHTML='<div class=\\'w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs\\'>${iniciais}</div>';">`
                : `<div class="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs shadow-inner">${iniciais}</div>`;

            let statusBadge = '';
            if (f.em_atestado_agora) {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"><i class="fa-solid fa-notes-medical mr-1"></i>Atestado</span>`;
            } else if (f.status === 'Ativo') {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-circle text-[7px] text-emerald-500 mr-1"></i>Ativo</span>`;
            } else {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Desligado</span>`;
            }

            // Férias CLT Badge
            let feriasBadgeHtml = '';
            if (f.status === 'Desligado') {
                feriasBadgeHtml = `<span class="text-slate-400 text-[10px]">---</span>`;
            } else if (f.ferias_status === 'SEM_DATA') {
                feriasBadgeHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 font-medium">Sem Admissão</span>`;
            } else {
                let badgeStyle = f.ferias_badge_class || 'bg-slate-100 text-slate-700';
                feriasBadgeHtml = `
                    <div class="cursor-pointer hover:scale-105 transition" onclick="abrirModalFerias(${f.id})" title="${f.ferias_alerta || 'Clique para gerenciar as férias'}">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] ${badgeStyle}">
                            ${f.ferias_label}
                        </span>
                        ${f.ferias_limite ? `<div class="text-[9px] text-slate-500 mt-0.5 font-medium"><i class="fa-regular fa-clock mr-0.5"></i>Limite: ${f.ferias_limite}</div>` : ''}
                    </div>
                `;
            }

            const salFuncaoFmt = f.salario_funcao ? formatarMoeda(f.salario_funcao) : (f.salario ? formatarMoeda(f.salario) : 'R$ 0,00');
            const premioAssidFmt = f.premio_assiduidade ? `+ ${formatarMoeda(f.premio_assiduidade)}` : '+ R$ 0,00';
            const salBrutoFmt = f.salario_bruto ? formatarMoeda(f.salario_bruto) : (f.salario ? formatarMoeda(f.salario) : 'R$ 0,00');
            const valorHoraFormatado = f.valor_hora ? `R$ ${parseFloat(f.valor_hora).toFixed(2)}/h` : '';

            return `
                <tr class="hover:bg-blue-50/40 transition">
                    <!-- Colaborador -->
                    <td class="py-3 px-4">
                        <div class="flex items-center space-x-3">
                            ${fotoHtml}
                            <div>
                                <div class="font-bold text-slate-900 text-xs">${f.nome}</div>
                                <div class="text-[11px] text-slate-500 flex items-center space-x-2">
                                    <span>Mat: <strong>${f.matricula || '---'}</strong></span>
                                    ${f.admissao ? `<span class="text-slate-400">&bull; Adm: ${formatarData(f.admissao)}</span>` : ''}
                                    ${f.telefone ? `<span>&bull; <i class="fa-solid fa-phone text-emerald-600 text-[9px]"></i> ${f.telefone}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </td>

                    <!-- Cargo -->
                    <td class="py-3 px-3">
                        <span class="font-medium text-slate-800">${f.cargo || '---'}</span>
                    </td>

                    <!-- Local de Trabalho -->
                    <td class="py-3 px-3">
                        <span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            📍 ${f.local_trabalho || 'CDA'}
                        </span>
                    </td>

                    <!-- Remuneração (Função / Assiduidade / Bruto) -->
                    <td class="py-3 px-3">
                        <div class="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                            <span class="text-slate-500 font-normal">Bruto:</span>
                            <span class="text-indigo-700 font-mono font-extrabold">${salBrutoFmt}</span>
                        </div>
                        <div class="text-[11px] text-slate-600 flex items-center space-x-1 mt-0.5">
                            <span>Função: ${salFuncaoFmt}</span>
                        </div>
                        <div class="text-[10px] text-emerald-700 font-semibold flex items-center space-x-1 mt-0.5">
                            <span class="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"><i class="fa-solid fa-gift mr-1"></i>Assid.: ${premioAssidFmt}</span>
                            ${valorHoraFormatado ? `<span class="text-slate-400">&bull; ${valorHoraFormatado}</span>` : ''}
                        </div>
                    </td>

                    <!-- Status -->
                    <td class="py-3 px-3">
                        ${statusBadge}
                    </td>

                    <!-- Férias CLT -->
                    <td class="py-3 px-3 text-center">
                        ${feriasBadgeHtml}
                    </td>

                    <!-- Ações Rápidas (Atestados / Horas / Férias / Editar) -->
                    <td class="py-3 px-4 text-center">
                        <div class="inline-flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                            <button onclick="abrirModalEditar(${f.id})" title="Visualizar e Editar Ficha Cadastral" class="w-7 h-7 bg-white hover:bg-blue-600 hover:text-white text-slate-700 rounded shadow-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-user-pen"></i>
                            </button>
                            <button onclick="abrirModalFerias(${f.id})" title="Gestão de Férias CLT (${f.total_ferias || 0})" class="w-7 h-7 relative bg-white hover:bg-teal-600 hover:text-white text-teal-700 rounded shadow-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-umbrella-beach"></i>
                                ${f.total_ferias > 0 ? `<span class="absolute -top-1 -right-1 bg-teal-600 text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">${f.total_ferias}</span>` : ''}
                            </button>
                            <button onclick="abrirModalAtestados(${f.id})" title="Atestados Médicos (${f.total_atestados})" class="w-7 h-7 relative bg-white hover:bg-amber-600 hover:text-white text-slate-700 rounded shadow-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-file-waveform"></i>
                                ${f.total_atestados > 0 ? `<span class="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">${f.total_atestados}</span>` : ''}
                            </button>
                            <button onclick="abrirModalContracheques(${f.id})" title="Holerites / Contracheques (${f.total_contracheques || 0})" class="w-7 h-7 relative bg-white hover:bg-emerald-600 hover:text-white text-emerald-700 rounded shadow-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-file-invoice-dollar"></i>
                                ${f.total_contracheques > 0 ? `<span class="absolute -top-1 -right-1 bg-emerald-600 text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">${f.total_contracheques}</span>` : ''}
                            </button>
                            <button onclick="abrirModalHorasExtras(${f.id})" title="Lançar Horas Extras (${f.total_horas_extras})" class="w-7 h-7 relative bg-white hover:bg-blue-600 hover:text-white text-slate-700 rounded shadow-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-stopwatch"></i>
                                ${f.total_horas_extras > 0 ? `<span class="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">${f.total_horas_extras}</span>` : ''}
                            </button>
                        </div>
                    </td>

                    <!-- Emissão de Documentos Legais -->
                    <td class="py-3 px-4 text-right">
                        <div class="inline-flex items-center space-x-1">
                            <button onclick="abrirDocumento(${f.id}, 'uniforme')" title="Termo de Uniforme" class="px-2 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded text-[11px] font-semibold border border-blue-200 transition">
                                👕 Uniforme
                            </button>
                            <button onclick="abrirDocumento(${f.id}, 'cartao')" title="Termo do Cartão Alimentação" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded text-[11px] font-semibold border border-indigo-200 transition">
                                💳 Cartão
                            </button>
                            <button onclick="abrirDocumento(${f.id}, 'epi')" title="Ficha de EPI (NR-06)" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded text-[11px] font-semibold border border-emerald-200 transition">
                                🦺 EPI
                            </button>
                            <button onclick="abrirDocumento(${f.id}, 'aviso_ferias')" title="Aviso Prévio de Férias (Art. 135 CLT)" class="px-2 py-1 bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-800 rounded text-[11px] font-semibold border border-amber-200 transition">
                                🌴 Aviso
                            </button>
                            <button onclick="abrirDocumento(${f.id}, 'recibo_ferias')" title="Recibo de Pagamento de Férias (Art. 145 CLT)" class="px-2 py-1 bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-800 rounded text-[11px] font-semibold border border-teal-200 transition">
                                💰 Recibo
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Erro ao listar funcionários:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-10 text-center text-rose-500">
                    <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                    <p>Falha ao carregar funcionários do servidor.</p>
                </td>
            </tr>
        `;
    }
}

function debounceBusca() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        carregarFuncionarios();
    }, 280);
}

// =========================================================================
// MODAL: FICHA DO FUNCIONÁRIO (NOVO / EDITAR)
// =========================================================================
function mudarAbaFicha(abaId) {
    ['abaDadosPessoais', 'abaContratual', 'abaEndereco', 'abaBancario'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(abaId).classList.remove('hidden');

    document.querySelectorAll('.aba-btn').forEach(btn => {
        btn.classList.remove('border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-slate-600');
    });

    const btnId = 'btn' + abaId.charAt(0).toUpperCase() + abaId.slice(1);
    const btnAtivo = document.getElementById(btnId);
    if (btnAtivo) {
        btnAtivo.classList.remove('border-transparent', 'text-slate-600');
        btnAtivo.classList.add('border-blue-600', 'text-blue-600');
    }
}

// =========================================================================
// GESTÃO DE FOTO DO COLABORADOR
// =========================================================================
function getFotoUrl(fotoPath) {
    if (!fotoPath || !fotoPath.trim()) return '';
    let clean = fotoPath.trim().replace(/\\/g, '/');
    if (!clean.startsWith('/')) clean = '/' + clean;
    return clean;
}

function selecionarArquivoFoto() {
    const fileInput = document.getElementById('f_foto_file');
    if (fileInput) fileInput.click();
}

function processarArquivoFoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione um arquivo de imagem válido (JPG, PNG ou WEBP).');
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        alert('A foto selecionada é muito grande (máximo 8MB). Escolha uma imagem menor.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const b64 = e.target.result;
        document.getElementById('f_foto_base64').value = b64;
        definirPreviewFoto(b64);
    };
    reader.readAsDataURL(file);
}

function removerFotoFuncionario() {
    if (document.getElementById('f_foto_file')) document.getElementById('f_foto_file').value = '';
    document.getElementById('f_foto_path').value = '';
    document.getElementById('f_foto_base64').value = 'REMOVE';
    const nome = document.getElementById('f_nome').value || 'FC';
    const iniciais = (nome.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2) || 'FC').toUpperCase();
    definirPreviewFoto(null, iniciais);
}

function definirPreviewFoto(urlOrBase64, iniciais = 'FC') {
    const img = document.getElementById('f_foto_preview');
    const placeholder = document.getElementById('f_foto_placeholder');
    const btnRemover = document.getElementById('btnRemoverFoto');
    const btnTexto = document.getElementById('btnFotoTexto');

    if (urlOrBase64 && urlOrBase64.trim()) {
        img.src = urlOrBase64;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
        if (btnRemover) btnRemover.classList.remove('hidden');
        if (btnTexto) btnTexto.textContent = 'Trocar Foto';
    } else {
        img.src = '';
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = `
            <div class="w-10 h-10 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs mb-1 border border-slate-200">
                ${iniciais}
            </div>
            <span class="block text-[10px] text-slate-400 font-medium">Sem Foto</span>
        `;
        if (btnRemover) btnRemover.classList.add('hidden');
        if (btnTexto) btnTexto.textContent = 'Escolher Foto';
    }
}

function initFotoDragAndDrop() {
    const dropZone = document.getElementById('fotoPreviewContainer');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('border-blue-600', 'bg-blue-50/50');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-blue-600', 'bg-blue-50/50');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            const fileInput = document.getElementById('f_foto_file');
            if (fileInput) {
                fileInput.files = files;
                processarArquivoFoto(fileInput);
            }
        }
    }, false);
}

function abrirModalNovoFuncionario() {
    document.getElementById('formFuncionario').reset();
    document.getElementById('f_id').value = '';
    document.getElementById('f_foto_path').value = '';
    document.getElementById('f_foto_base64').value = '';
    if (document.getElementById('f_foto_file')) document.getElementById('f_foto_file').value = '';
    definirPreviewFoto(null, 'NO');
    document.getElementById('f_salario_funcao').value = '';
    document.getElementById('f_premio_assiduidade').value = '';
    document.getElementById('f_salario_bruto').value = '';
    document.getElementById('f_valor_hora').value = '';
    document.getElementById('modalFuncionarioTitulo').textContent = 'Novo Colaborador';
    document.getElementById('btnExcluirFuncionario').classList.add('hidden');
    mudarAbaFicha('abaDadosPessoais');
    abrirModal('modalFuncionario');
}

async function abrirModalEditar(id) {
    try {
        const res = await fetch(`/api/funcionarios/${id}`);
        const f = await res.json();
        if (f.error) return alert(f.error);

        document.getElementById('f_id').value = f.id;
        document.getElementById('f_nome').value = f.nome || '';
        document.getElementById('f_matricula').value = f.matricula || '';
        document.getElementById('f_cpf').value = f.cpf || '';
        document.getElementById('f_rg').value = f.rg || '';
        document.getElementById('f_data_nascimento').value = f.data_nascimento || '';
        document.getElementById('f_telefone').value = f.telefone || '';
        document.getElementById('f_foto_path').value = f.foto_path || '';
        document.getElementById('f_foto_base64').value = '';
        if (document.getElementById('f_foto_file')) document.getElementById('f_foto_file').value = '';

        const iniciais = (f.nome ? f.nome.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2) : 'FC').toUpperCase();
        if (f.foto_path) {
            definirPreviewFoto(getFotoUrl(f.foto_path), iniciais);
        } else {
            definirPreviewFoto(null, iniciais);
        }

        document.getElementById('f_cargo').value = f.cargo || '';
        document.getElementById('f_local_trabalho').value = f.local_trabalho || '';
        document.getElementById('f_salario_funcao').value = f.salario_funcao || f.salario || '';
        document.getElementById('f_premio_assiduidade').value = f.premio_assiduidade || 0;
        document.getElementById('f_salario_bruto').value = f.salario_bruto || f.salario || '';
        document.getElementById('f_valor_hora').value = (f.valor_hora !== undefined && f.valor_hora !== null && f.valor_hora !== '') ? parseFloat(f.valor_hora).toFixed(2) : '';
        document.getElementById('f_status').value = f.status || 'Ativo';
        document.getElementById('f_admissao').value = f.admissao || '';
        document.getElementById('f_demissao').value = f.demissao || '';
        document.getElementById('f_observacoes').value = f.observacoes || '';

        document.getElementById('f_rua').value = f.rua || '';
        document.getElementById('f_numero').value = f.numero || '';
        document.getElementById('f_bairro').value = f.bairro || '';
        document.getElementById('f_cidade').value = f.cidade || '';
        document.getElementById('f_cep').value = f.cep || '';

        document.getElementById('f_banco').value = f.banco || '';
        document.getElementById('f_agencia').value = f.agencia || '';
        document.getElementById('f_conta').value = f.conta || '';
        document.getElementById('f_pix').value = f.pix || '';

        document.getElementById('modalFuncionarioTitulo').textContent = `Ficha: ${f.nome}`;
        document.getElementById('btnExcluirFuncionario').classList.remove('hidden');

        mudarAbaFicha('abaDadosPessoais');
        abrirModal('modalFuncionario');
    } catch (err) {
        console.error('Erro ao abrir funcionário:', err);
    }
}

function atualizarCalculosSalario() {
    const sFuncao = parseFloat(document.getElementById('f_salario_funcao').value) || 0;
    const sAssid = parseFloat(document.getElementById('f_premio_assiduidade').value) || 0;
    const bruto = sFuncao + sAssid;
    document.getElementById('f_salario_bruto').value = bruto.toFixed(2);
    if (sFuncao > 0) {
        document.getElementById('f_valor_hora').value = (sFuncao / 220).toFixed(2);
    }
}

async function salvarFuncionario(e) {
    e.preventDefault();
    const id = document.getElementById('f_id').value;

    const sFuncao = parseFloat(document.getElementById('f_salario_funcao').value) || 0;
    const sAssid = parseFloat(document.getElementById('f_premio_assiduidade').value) || 0;
    const sBruto = parseFloat((sFuncao + sAssid).toFixed(2));

    const body = {
        nome: document.getElementById('f_nome').value,
        matricula: document.getElementById('f_matricula').value,
        cpf: document.getElementById('f_cpf').value,
        rg: document.getElementById('f_rg').value,
        data_nascimento: document.getElementById('f_data_nascimento').value,
        telefone: document.getElementById('f_telefone').value,
        foto_path: document.getElementById('f_foto_path').value,
        foto_base64: document.getElementById('f_foto_base64').value,
        cargo: document.getElementById('f_cargo').value,
        local_trabalho: document.getElementById('f_local_trabalho').value,
        salario_funcao: sFuncao,
        premio_assiduidade: sAssid,
        salario_bruto: sBruto,
        salario: sBruto,
        valor_hora: (() => {
            const vh = parseFloat(document.getElementById('f_valor_hora').value);
            if (!isNaN(vh) && vh > 0) return parseFloat(vh.toFixed(2));
            if (sFuncao > 0) return parseFloat((sFuncao / 220).toFixed(2));
            return 0.0;
        })(),
        status: document.getElementById('f_status').value,
        admissao: document.getElementById('f_admissao').value,
        demissao: document.getElementById('f_demissao').value,
        observacoes: document.getElementById('f_observacoes').value,
        rua: document.getElementById('f_rua').value,
        numero: document.getElementById('f_numero').value,
        bairro: document.getElementById('f_bairro').value,
        cidade: document.getElementById('f_cidade').value,
        cep: document.getElementById('f_cep').value,
        banco: document.getElementById('f_banco').value,
        agencia: document.getElementById('f_agencia').value,
        conta: document.getElementById('f_conta').value,
        pix: document.getElementById('f_pix').value
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/funcionarios/${id}` : '/api/funcionarios';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            fecharModal('modalFuncionario');
            carregarStats();
            carregarFuncionarios();
        } else {
            alert('Erro ao salvar dados do colaborador.');
        }
    } catch (err) {
        console.error('Erro ao submeter formulário:', err);
    }
}

async function excluirFuncionario() {
    const id = document.getElementById('f_id').value;
    const nome = document.getElementById('f_nome').value;
    if (!id) return;

    if (confirm(`Tem certeza que deseja excluir o cadastro de ${nome}? Todos os registros de atestados e horas associados também serão removidos.`)) {
        try {
            const res = await fetch(`/api/funcionarios/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fecharModal('modalFuncionario');
                carregarStats();
                carregarFuncionarios();
            }
        } catch (err) {
            console.error('Erro ao excluir:', err);
        }
    }
}

// =========================================================================
// MODAL: ATESTADOS MÉDICOS
// =========================================================================
async function abrirModalAtestados(id) {
    funcionarioAtualId = id;
    try {
        const res = await fetch(`/api/funcionarios/${id}`);
        const f = await res.json();
        document.getElementById('atestadoFuncionarioNome').textContent = `Colaborador: ${f.nome} (Matrícula: ${f.matricula || '---'})`;

        // Reset Form
        document.getElementById('formAtestado').reset();
        document.getElementById('atest_inicio').value = new Date().toISOString().split('T')[0];
        document.getElementById('atest_dias').value = 1;
        calcularRetornoAtestado();

        carregarListaAtestados(f.atestados || []);
        abrirModal('modalAtestados');
    } catch (err) {
        console.error('Erro ao abrir atestados:', err);
    }
}

function calcularRetornoAtestado() {
    const inicioStr = document.getElementById('atest_inicio').value;
    const dias = parseInt(document.getElementById('atest_dias').value) || 1;
    if (!inicioStr) return;

    const d = new Date(inicioStr + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    document.getElementById('atest_retorno').value = d.toISOString().split('T')[0];
}

function carregarListaAtestados(lista) {
    const tbody = document.getElementById('listaAtestadosTabela');
    if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Nenhum atestado registrado para este colaborador.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(a => `
        <tr class="hover:bg-amber-50/50">
            <td class="py-2 px-3 font-semibold">${formatarData(a.data_inicio)}</td>
            <td class="py-2 px-2">${a.dias_afastamento} dia(s)</td>
            <td class="py-2 px-3 font-semibold text-amber-800">${formatarData(a.data_retorno)}</td>
            <td class="py-2 px-3">${a.cid ? `<strong>CID:</strong> ${a.cid} ` : ''}${a.medico_crm ? `(${a.medico_crm})` : ''}</td>
            <td class="py-2 px-3">
                ${a.motivo || '---'}
                ${a.anexo_path ? `<a href="/${a.anexo_path}" target="_blank" class="ml-2 text-blue-600 underline hover:text-blue-800"><i class="fa-solid fa-paperclip"></i> Anexo</a>` : ''}
            </td>
            <td class="py-2 px-2 text-center">
                <button onclick="excluirAtestado(${a.id})" class="text-rose-600 hover:text-rose-800" title="Excluir Atestado">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function salvarAtestado(e) {
    e.preventDefault();
    if (!funcionarioAtualId) return;

    const body = {
        data_inicio: document.getElementById('atest_inicio').value,
        dias_afastamento: parseInt(document.getElementById('atest_dias').value) || 1,
        data_retorno: document.getElementById('atest_retorno').value,
        cid: document.getElementById('atest_cid').value,
        medico_crm: document.getElementById('atest_crm').value,
        motivo: document.getElementById('atest_motivo').value
    };

    try {
        const res = await fetch(`/api/funcionarios/${funcionarioAtualId}/atestados`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            // Atualiza lista
            const resF = await fetch(`/api/funcionarios/${funcionarioAtualId}`);
            const f = await resF.json();
            carregarListaAtestados(f.atestados || []);
            document.getElementById('formAtestado').reset();
            carregarStats();
            carregarFuncionarios();
        }
    } catch (err) {
        console.error('Erro ao salvar atestado:', err);
    }
}

async function excluirAtestado(id) {
    if (!confirm('Deseja excluir este atestado médico?')) return;
    try {
        const res = await fetch(`/api/atestados/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const resF = await fetch(`/api/funcionarios/${funcionarioAtualId}`);
            const f = await resF.json();
            carregarListaAtestados(f.atestados || []);
            carregarStats();
            carregarFuncionarios();
        }
    } catch (err) {
        console.error('Erro ao excluir atestado:', err);
    }
}

// =========================================================================
// MODAL: HORAS EXTRAS
// =========================================================================
async function abrirModalHorasExtras(id) {
    funcionarioAtualId = id;
    try {
        const res = await fetch(`/api/funcionarios/${id}`);
        const f = await res.json();
        document.getElementById('heFuncionarioNome').textContent = `Colaborador: ${f.nome} (Salário: ${formatarMoeda(f.salario || 0)})`;

        document.getElementById('formHorasExtras').reset();
        document.getElementById('he_data').value = new Date().toISOString().split('T')[0];

        carregarListaHorasExtras(f.horas_extras || []);
        abrirModal('modalHorasExtras');
    } catch (err) {
        console.error('Erro ao abrir horas extras:', err);
    }
}

function carregarListaHorasExtras(lista) {
    const tbody = document.getElementById('listaHorasTabela');
    const badge = document.getElementById('totalHorasBadge');

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Nenhuma hora extra registrada.</td></tr>`;
        badge.textContent = 'Total: 0.0 hrs';
        return;
    }

    let somaHoras = 0;
    let somaValores = 0;

    tbody.innerHTML = lista.map(h => {
        somaHoras += parseFloat(h.quantidade_horas || 0);
        somaValores += parseFloat(h.valor_calculado || 0);

        return `
            <tr class="hover:bg-blue-50/50">
                <td class="py-2 px-3 font-semibold">${formatarData(h.data)}</td>
                <td class="py-2 px-2"><span class="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">${h.percentual}</span></td>
                <td class="py-2 px-2 font-mono font-bold">${parseFloat(h.quantidade_horas).toFixed(1)} h</td>
                <td class="py-2 px-3 text-emerald-700 font-semibold">${h.valor_calculado ? formatarMoeda(h.valor_calculado) : '---'}</td>
                <td class="py-2 px-3">${h.motivo || 'Atividades operacionais'}</td>
                <td class="py-2 px-2 text-center">
                    <button onclick="excluirHoraExtra(${h.id})" class="text-rose-600 hover:text-rose-800" title="Excluir">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    badge.textContent = `Total: ${somaHoras.toFixed(1)} hrs (${formatarMoeda(somaValores)})`;
}

async function salvarHorasExtras(e) {
    e.preventDefault();
    if (!funcionarioAtualId) return;

    const body = {
        data: document.getElementById('he_data').value,
        percentual: document.getElementById('he_percentual').value,
        quantidade_horas: parseFloat(document.getElementById('he_horas').value) || 0,
        motivo: document.getElementById('he_motivo').value
    };

    try {
        const res = await fetch(`/api/funcionarios/${funcionarioAtualId}/horas-extras`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const resF = await fetch(`/api/funcionarios/${funcionarioAtualId}`);
            const f = await resF.json();
            carregarListaHorasExtras(f.horas_extras || []);
            document.getElementById('he_horas').value = '';
            document.getElementById('he_motivo').value = '';
            carregarStats();
            carregarFuncionarios();
        }
    } catch (err) {
        console.error('Erro ao salvar horas extras:', err);
    }
}

async function excluirHoraExtra(id) {
    if (!confirm('Deseja excluir este registro de horas extras?')) return;
    try {
        const res = await fetch(`/api/horas-extras/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const resF = await fetch(`/api/funcionarios/${funcionarioAtualId}`);
            const f = await resF.json();
            carregarListaHorasExtras(f.horas_extras || []);
            carregarStats();
            carregarFuncionarios();
        }
    } catch (err) {
        console.error('Erro ao excluir hora extra:', err);
    }
}

// =========================================================================
// EMISSÃO E IMPRESSÃO DE DOCUMENTOS LEGAIS (UNIFORME, CARTÃO, FICHA EPI)
// =========================================================================
async function abrirDocumento(id, tipo) {
    funcionarioAtualId = id;
    tipoDocumentoAtual = tipo || 'uniforme';

    try {
        const res = await fetch(`/api/funcionarios/${id}`);
        colaboradorAtualDocumento = await res.json();
        if (colaboradorAtualDocumento.error) return alert('Colaborador não encontrado');

        document.getElementById('docModalSubtitulo').textContent = `${colaboradorAtualDocumento.nome} | Mat: ${colaboradorAtualDocumento.matricula || '---'}`;
        trocarDocumento(tipoDocumentoAtual);
        abrirModal('modalDocumentos');
    } catch (err) {
        console.error('Erro ao carregar documento:', err);
    }
}

function trocarDocumento(tipo) {
    tipoDocumentoAtual = tipo;

    // Atualiza Abas
    ['tabDocUniforme', 'tabDocCartao', 'tabDocEPI', 'tabDocAvisoFerias', 'tabDocReciboFerias'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('border-blue-600', 'text-blue-600', 'border-amber-600', 'text-amber-700', 'border-teal-600', 'text-teal-700');
            el.classList.add('border-transparent', 'text-slate-600');
        }
    });

    const tabMap = {
        'uniforme': 'tabDocUniforme',
        'cartao': 'tabDocCartao',
        'epi': 'tabDocEPI',
        'aviso_ferias': 'tabDocAvisoFerias',
        'recibo_ferias': 'tabDocReciboFerias'
    };
    const activeTab = document.getElementById(tabMap[tipo]);
    if (activeTab) {
        activeTab.classList.remove('border-transparent', 'text-slate-600');
        if (tipo === 'aviso_ferias') {
            activeTab.classList.add('border-amber-600', 'text-amber-700');
        } else if (tipo === 'recibo_ferias') {
            activeTab.classList.add('border-teal-600', 'text-teal-700');
        } else {
            activeTab.classList.add('border-blue-600', 'text-blue-600');
        }
    }

    // Painel EPI extra controls
    const painelEpi = document.getElementById('painelAdicionarEPI');
    if (painelEpi) {
        if (tipo === 'epi') {
            painelEpi.classList.remove('hidden');
        } else {
            painelEpi.classList.add('hidden');
            fecharMiniFormEPI();
        }
    }

    renderizarFolhaA4();
}

function renderizarFolhaA4() {
    const f = colaboradorAtualDocumento;
    const folha = document.getElementById('folhaA4');
    if (!f || !folha) return;

    const dataHojeExtenso = getDataHojePorExtenso(f.cidade);

    if (tipoDocumentoAtual === 'uniforme') {
        folha.innerHTML = `
            <div>
                <!-- CABEÇALHO OFICIAL DA EMPRESA COM LOGO -->
                <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-6">
                    <img src="/static/logo-dark.png" alt="Santos Manutenções" class="h-14 w-auto object-contain">
                    <div class="text-right">
                        <h2 class="text-xl font-black uppercase text-slate-900 tracking-wider">SANTOS MANUTENÇÃO</h2>
                        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">Salviano Silva Santos Manutenção</h3>
                        <p class="text-[10px] text-slate-500">Gestão de Pessoal e Segurança Ocupacional</p>
                    </div>
                </div>

                <!-- TÍTULO DO TERMO -->
                <div class="text-center mb-8">
                    <h1 class="text-lg font-bold uppercase tracking-wide border-y border-slate-300 py-2 inline-block px-6">
                        TERMO DE ENTREGA E RESPONSABILIDADE DE UNIFORME
                    </h1>
                </div>

                <!-- TEXTO DO TERMO (CONFORME PLANILHA ORIGINAL) -->
                <div class="text-justify text-sm leading-relaxed space-y-6 text-slate-800">
                    <p>
                        Eu, <strong class="underline">${f.nome}</strong>, portador do 
                        RG: <strong>${f.rg || '_________________'}</strong> e 
                        CPF: <strong>${f.cpf || '_________________'}</strong>, exercendo o cargo/função de 
                        <strong>${f.cargo || 'MANTENEDOR'}</strong>, alocado no local de trabalho 
                        <strong>${f.local_trabalho || 'CDA / Matriz'}</strong>:
                    </p>

                    <div class="p-5 bg-slate-50 border-l-4 border-slate-900 text-slate-800 font-medium italic text-xs leading-relaxed">
                        DECLARO O RECEBIMENTO DE 01 UNIDADE DO UNIFORME, O QUAL ME COMPROMETO A UTILIZAR NA REALIZAÇÃO DO MEU TRABALHO E TAMBÉM ASSUMO A RESPONSABILIDADE PELA ENTREGA E CONSERVAÇÃO DO MESMO, CASO VENHA A ME DESLIGAR DA EMPRESA ME COMPROMETO EM ENTREGAR O UNIFORME.
                    </div>

                    <p>
                        Declaro ainda estar ciente de que o uniforme fornecido é de propriedade exclusiva da empresa <strong>SANTOS MANUTENÇÃO</strong>, devendo ser utilizado estritamente no horário e local de trabalho, responsabilizando-me por eventuais danos causados por negligência ou mau uso do mesmo.
                    </p>
                </div>
            </div>

            <!-- BLOCO DE DATA E ASSINATURAS -->
            <div class="mt-16 pt-8 space-y-12">
                <p class="text-right text-xs font-medium text-slate-700">${dataHojeExtenso}</p>

                <div class="grid grid-cols-2 gap-12 pt-6">
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-2">
                            <p class="font-bold text-xs uppercase">${f.nome}</p>
                            <p class="text-[11px] text-slate-600">CPF: ${f.cpf || '_________________'}</p>
                            <p class="text-[10px] text-slate-500">Assinatura do Colaborador</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-2">
                            <p class="font-bold text-xs uppercase">SANTOS MANUTENÇÃO</p>
                            <p class="text-[11px] text-slate-600">Almoxarifado / Recursos Humanos</p>
                            <p class="text-[10px] text-slate-500">Responsável pela Entrega</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (tipoDocumentoAtual === 'cartao') {
        folha.innerHTML = `
            <div>
                <!-- CABEÇALHO COM LOGO -->
                <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-6">
                    <img src="/static/logo-dark.png" alt="Santos Manutenções" class="h-14 w-auto object-contain">
                    <div class="text-right">
                        <h2 class="text-xl font-black uppercase text-slate-900 tracking-wider">SANTOS MANUTENÇÃO</h2>
                        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">Salviano Silva Santos Manutenção</h3>
                        <p class="text-[10px] text-slate-500">Gestão de Benefícios e Recursos Humanos</p>
                    </div>
                </div>

                <!-- TÍTULO -->
                <div class="text-center mb-8">
                    <h1 class="text-base font-bold uppercase tracking-wide border-y border-slate-300 py-2 inline-block px-4">
                        TERMO DE OPÇÃO AO VALE-ALIMENTAÇÃO OU VALE-REFEIÇÃO
                    </h1>
                </div>

                <!-- CORPO DO TERMO (CONFORME MODELO OFICIAL) -->
                <div class="text-justify text-xs leading-relaxed space-y-4 text-slate-800">
                    <p>
                        Eu, <strong class="underline">${f.nome}</strong>, portador do 
                        RG: <strong>${f.rg || '_________________'}</strong> e 
                        CPF: <strong>${f.cpf || '_________________'}</strong>:
                    </p>

                    <p>
                        Declaro, para os devidos fins, que estou ciente de que a empresa disponibiliza o benefício de <strong>cartão alimentação</strong>, o qual poderá ser utilizado para aquisição de gêneros alimentícios em estabelecimentos conveniados, ou, alternativamente, o <strong>cartão refeição</strong>, destinado ao pagamento de refeições prontas.
                    </p>

                    <p>
                        Conforme política interna da empresa e condições estabelecidas pela gestora do benefício, declaro ainda que tenho ciência de que é possível transferir, por meio do aplicativo da administradora do cartão, os valores da carteira alimentação para a carteira refeição, ficando, portanto, ambas as opções disponíveis para utilização conforme minha conveniência.
                    </p>

                    <p class="font-bold text-slate-900 pt-2">
                        Diante disso, opto pelo seguinte benefício principal (assinalar uma das opções abaixo):
                    </p>

                    <!-- OPÇÕES DE MARCAÇÃO -->
                    <div class="p-4 border-2 border-slate-300 rounded-lg space-y-3 bg-slate-50 text-xs">
                        <div class="flex items-center space-x-3">
                            <div class="w-5 h-5 border-2 border-slate-700 rounded flex items-center justify-center font-bold"></div>
                            <span><strong>VALE-ALIMENTAÇÃO</strong> (Aquisição de gêneros alimentícios em supermercados/mercearias)</span>
                        </div>
                        <div class="flex items-center space-x-3">
                            <div class="w-5 h-5 border-2 border-slate-700 rounded flex items-center justify-center font-bold"></div>
                            <span><strong>VALE-REFEIÇÃO</strong> (Refeições prontas em restaurantes, lanchonetes e similares)</span>
                        </div>
                    </div>

                    <div class="border border-slate-200 p-3 rounded bg-slate-50/70">
                        <p class="text-[11px] text-slate-700">
                            <strong>Nº do Cartão Entregue:</strong> __________________________________________________
                        </p>
                    </div>
                </div>
            </div>

            <!-- ASSINATURA -->
            <div class="mt-16 pt-8 space-y-12">
                <p class="text-right text-xs font-medium text-slate-700">${dataHojeExtenso}</p>

                <div class="grid grid-cols-2 gap-12 pt-6">
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-2">
                            <p class="font-bold text-xs uppercase">${f.nome}</p>
                            <p class="text-[11px] text-slate-600">CPF: ${f.cpf || '_________________'}</p>
                            <p class="text-[10px] text-slate-500">Assinatura do Empregado</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-2">
                            <p class="font-bold text-xs uppercase">SANTOS MANUTENÇÃO</p>
                            <p class="text-[11px] text-slate-600">Recursos Humanos / Departamento Pessoal</p>
                            <p class="text-[10px] text-slate-500">Visto da Empresa</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (tipoDocumentoAtual === 'epi') {
        const episList = f.epis || [];
        // Gera linhas da tabela preenchidas e completa até 8 linhas para preenchimento posterior
        let linhasTabela = '';
        const totalLinhas = Math.max(episList.length + 3, 8);

        for (let i = 0; i < totalLinhas; i++) {
            const item = episList[i];
            if (item) {
                linhasTabela += `
                    <tr>
                        <td class="border border-slate-400 py-1.5 px-2 font-mono font-bold">${item.ca || '---'}</td>
                        <td class="border border-slate-400 py-1.5 px-2 text-center font-bold">${item.quantidade}</td>
                        <td class="border border-slate-400 py-1.5 px-2 font-semibold">${item.descricao}</td>
                        <td class="border border-slate-400 py-1.5 px-2 text-center">${formatarData(item.data_entrega)}</td>
                        <td class="border border-slate-400 py-1.5 px-2 text-center text-slate-400 italic">___________________</td>
                    </tr>
                `;
            } else {
                linhasTabela += `
                    <tr>
                        <td class="border border-slate-400 py-2.5 px-2">&nbsp;</td>
                        <td class="border border-slate-400 py-2.5 px-2 text-center">&nbsp;</td>
                        <td class="border border-slate-400 py-2.5 px-2">&nbsp;</td>
                        <td class="border border-slate-400 py-2.5 px-2 text-center">&nbsp;</td>
                        <td class="border border-slate-400 py-2.5 px-2 text-center">&nbsp;</td>
                    </tr>
                `;
            }
        }

        folha.innerHTML = `
            <div>
                <!-- CABEÇALHO OFICIAL EPI COM LOGO -->
                <div class="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-2">
                    <img src="/static/logo-dark.png" alt="Santos Manutenções" class="h-12 w-auto object-contain">
                    <div class="text-right">
                        <h2 class="text-lg font-black uppercase text-slate-900 tracking-wider">SANTOS MANUTENÇÃO</h2>
                        <h3 class="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Salviano Silva Santos Manutenção</h3>
                        <p class="text-[9px] text-slate-500">Gestão de Segurança Ocupacional e NR-06</p>
                    </div>
                </div>
                <div class="text-center mb-2">
                    <h1 class="text-xs font-bold uppercase bg-slate-900 text-white py-1 px-3 inline-block rounded">
                        FICHA DE ENTREGA DE EPI - EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL
                    </h1>
                    <p class="text-[9px] text-slate-600 mt-0.5 font-medium">
                        Em cumprimento à Norma Regulamentadora NR-06 da Portaria MTb 3.214/78 e ao Art. 158 da CLT
                    </p>
                </div>

                <!-- DADOS DO COLABORADOR -->
                <div class="border border-slate-400 p-2 rounded mb-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50">
                    <div><strong>COLABORADOR:</strong> ${f.nome}</div>
                    <div><strong>MATRÍCULA:</strong> ${f.matricula || '---'}</div>
                    <div><strong>FUNÇÃO / CARGO:</strong> ${f.cargo || 'MANTENEDOR'}</div>
                    <div><strong>LOCAL DE TRABALHO:</strong> ${f.local_trabalho || 'CDA / Matriz'}</div>
                    <div><strong>CPF:</strong> ${f.cpf || '---'} &nbsp;|&nbsp; <strong>RG:</strong> ${f.rg || '---'}</div>
                    <div><strong>DATA DE ADMISSÃO:</strong> ${formatarData(f.admissao)}</div>
                </div>

                <!-- DECLARAÇÃO LEGAL COMPLETA DA EMPRESA -->
                <div class="text-[9px] text-justify leading-tight text-slate-800 p-2 border border-slate-300 rounded mb-3 bg-white">
                    Declaro sob minha inteira responsabilidade a guarda e conservação dos equipamentos de proteção individual constantes nesta ficha-controle. Assumo também a responsabilidade de devolvê-los integralmente ou parcialmente, quando solicitado, ou por ocasião de eventual rescisão de contrato, na data do respectivo aviso de qualquer das partes.
                    Também estou ciente que, na eventualidade de danificar ou extraviar o equipamento por ato doloso ou culposo, estarei sujeito ao desconto do valor em meu salário, conforme parágrafo único do art. 158 da Consolidação das leis do Trabalho (CLT). Também me comprometo a utilizá-los de forma correta e de acordo com as instruções de treinamento referentes ao uso correto, guarda, conservação e higienização dos EPIs, recebidas na presente data, fornecidas pelo empreendimento Salviano Silva Santos Manutenção. Também estou ciente que a não utilização dos mesmos em minhas atividades profissionais, é ato faltoso e passível de punições legais e disciplinares de acordo com a CLT art. 158; Norma Regulamentadora - NR 1 e 6, disciplinadas pela Portaria MTb. nº 3.214/78.
                </div>

                <!-- TABELA DE REGISTRO DE EPIS -->
                <table class="w-full border-collapse border border-slate-500 text-[10px] mb-4">
                    <thead>
                        <tr class="bg-slate-200 text-slate-800 font-bold uppercase">
                            <th class="border border-slate-400 py-1 px-2 w-20 text-left">CA</th>
                            <th class="border border-slate-400 py-1 px-1 w-12 text-center">QTD</th>
                            <th class="border border-slate-400 py-1 px-2 text-left">DESCRIÇÃO DO EPI</th>
                            <th class="border border-slate-400 py-1 px-2 w-24 text-center">DATA</th>
                            <th class="border border-slate-400 py-1 px-2 w-40 text-center">ASSINATURA</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasTabela}
                    </tbody>
                </table>
            </div>

            <!-- ASSINATURA -->
            <div class="pt-4 border-t border-slate-300 space-y-4">
                <div class="flex justify-between items-end text-[10px]">
                    <div>
                        <p class="text-slate-600">Empresa: <strong>Salviano Silva Santos Manutenção</strong></p>
                        <p class="text-slate-500">Técnico/Responsável pela Entrega: ___________________________</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold">${dataHojeExtenso}</p>
                        <p class="mt-4 pt-1 border-t border-slate-800 text-center inline-block min-w-[200px] font-bold">
                            ${f.nome}
                        </p>
                        <p class="text-[9px] text-slate-500 text-center">Assinatura do Empregado</p>
                    </div>
                </div>
            </div>
        `;
    } else if (tipoDocumentoAtual === 'aviso_ferias') {
        const feriasList = f.ferias || [];
        const fRecord = feriasList.find(item => item.status !== 'Cancelada') || (feriasList.length > 0 ? feriasList[0] : null);

        let paIni = '___/___/______';
        let paFim = '___/___/______';
        if (fRecord && fRecord.periodo_aquisitivo_inicio) {
            paIni = formatarData(fRecord.periodo_aquisitivo_inicio);
            paFim = formatarData(fRecord.periodo_aquisitivo_fim);
        } else if (f.diagnostico_ferias && f.diagnostico_ferias.ciclos && f.diagnostico_ferias.ciclos.length > 0) {
            const c0 = f.diagnostico_ferias.ciclos.find(c => c.dias_saldo > 0) || f.diagnostico_ferias.ciclos[0];
            paIni = c0.pa_inicio_br;
            paFim = c0.pa_fim_br;
        }

        const dtIni = fRecord ? formatarData(fRecord.data_inicio) : '___/___/______';
        const dtRet = fRecord ? formatarData(fRecord.data_retorno) : '___/___/______';
        const diasGozo = fRecord ? fRecord.dias : 30;
        const temAbono = fRecord && fRecord.abono_pecuniario;

        folha.innerHTML = `
            <div>
                <!-- CABEÇALHO OFICIAL COM LOGO -->
                <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-5">
                    <img src="/static/logo-dark.png" alt="Santos Manutenções" class="h-14 w-auto object-contain">
                    <div class="text-right">
                        <h2 class="text-xl font-black uppercase text-slate-900 tracking-wider">SANTOS MANUTENÇÃO</h2>
                        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">Salviano Silva Santos Manutenção</h3>
                        <p class="text-[10px] text-slate-500">Departamento de Recursos Humanos e Gestão de Pessoal</p>
                    </div>
                </div>

                <!-- TÍTULO DO AVISO -->
                <div class="text-center mb-6">
                    <h1 class="text-base font-bold uppercase tracking-wide border-y-2 border-slate-800 py-2 inline-block px-8 bg-slate-50">
                        AVISO PRÉVIO DE FÉRIAS (ART. 135 DA CLT)
                    </h1>
                </div>

                <!-- DADOS DO COLABORADOR -->
                <div class="border border-slate-300 p-3 rounded-lg mb-6 text-xs grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50/70">
                    <div><strong>COLABORADOR:</strong> <span class="uppercase">${f.nome}</span></div>
                    <div><strong>MATRÍCULA:</strong> ${f.matricula || '---'}</div>
                    <div><strong>CARGO / FUNÇÃO:</strong> ${f.cargo || '---'}</div>
                    <div><strong>LOCAL DE TRABALHO:</strong> ${f.local_trabalho || 'CDA / Matriz'}</div>
                    <div><strong>CPF:</strong> ${f.cpf || '---'} &nbsp;|&nbsp; <strong>RG:</strong> ${f.rg || '---'}</div>
                    <div><strong>DATA DE ADMISSÃO:</strong> ${formatarData(f.admissao)}</div>
                </div>

                <!-- CORPO DO COMUNICADO FORMAL -->
                <div class="text-justify text-xs leading-relaxed space-y-4 text-slate-800">
                    <p>
                        Prezado(a) Colaborador(a),
                    </p>

                    <p>
                        Vimos por meio desta comunicar-lhe, em estrito cumprimento ao disposto no <strong>Artigo 135 da Consolidação das Leis do Trabalho (CLT)</strong>, que suas férias relativas ao <strong>Período Aquisitivo de ${paIni} a ${paFim}</strong> foram programadas e ser-lhe-ão concedidas com início e término conforme discriminado a seguir:
                    </p>

                    <!-- QUADRO DE DATAS -->
                    <div class="border-2 border-slate-800 rounded-lg p-4 bg-slate-50 text-xs space-y-2 my-4">
                        <div class="grid grid-cols-3 gap-4 text-center font-bold">
                            <div class="bg-white p-2.5 rounded border border-slate-300">
                                <span class="text-[10px] text-slate-500 uppercase block font-semibold">Início do Gozo</span>
                                <span class="text-sm text-teal-800 font-extrabold">${dtIni}</span>
                            </div>
                            <div class="bg-white p-2.5 rounded border border-slate-300">
                                <span class="text-[10px] text-slate-500 uppercase block font-semibold">Duração da Fruição</span>
                                <span class="text-sm text-slate-800 font-extrabold">${diasGozo} dias corridos</span>
                            </div>
                            <div class="bg-white p-2.5 rounded border border-slate-300">
                                <span class="text-[10px] text-slate-500 uppercase block font-semibold">Retorno ao Trabalho</span>
                                <span class="text-sm text-emerald-800 font-extrabold">${dtRet}</span>
                            </div>
                        </div>
                        ${temAbono ? `<p class="text-[11px] text-amber-800 font-semibold text-center pt-1"><i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i>Opção de Abono Pecuniário de 10 dias deferida (Art. 143 CLT).</p>` : ''}
                    </div>

                    <p>
                        Solicitamos que apresente a sua <strong>Carteira de Trabalho e Previdência Social (CTPS)</strong> ou faça o acompanhamento via CTPS Digital para as anotações regulamentares, nos termos do § 1º do Art. 135 da CLT.
                    </p>

                    <p>
                        Informamos ainda que a remuneração das férias e o respectivo adicional de 1/3 constitucional serão creditados em sua conta bancária até <strong>2 (dois) dias antes do início do respectivo período de fruição</strong>, conforme preceitua o Artigo 145 da CLT.
                    </p>
                </div>
            </div>

            <!-- BLOCO DE DATA E ASSINATURAS -->
            <div class="mt-12 pt-6 border-t-2 border-dashed border-slate-300 space-y-8">
                <p class="text-right text-xs font-medium text-slate-700">${dataHojeExtenso}</p>

                <div class="grid grid-cols-2 gap-10 pt-4">
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-2">
                            <p class="font-bold text-xs uppercase">SANTOS MANUTENÇÃO</p>
                            <p class="text-[10px] text-slate-500">Recursos Humanos / Empregador</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-2">
                            <p class="font-bold text-xs uppercase">${f.nome}</p>
                            <p class="text-[10px] text-slate-500">Assinatura / Ciente do Empregado</p>
                        </div>
                    </div>
                </div>

                <!-- CANHOTO DESTACÁVEL / RECIBO -->
                <div class="pt-6 border-t border-slate-400 text-[10px] space-y-2">
                    <div class="flex justify-between items-center font-bold text-slate-700">
                        <span>CANHOTO DE PROTOCOLO &bull; AVISO DE FÉRIAS</span>
                        <span>SANTOS MANUTENÇÃO</span>
                    </div>
                    <p class="text-justify text-slate-600">
                        Recebi em _____/_____/_________ a comunicação oficial de aviso prévio de férias supra, tomando ciência do período de fruição de <strong>${dtIni} a ${dtRet}</strong>.
                    </p>
                    <div class="pt-4 flex justify-between items-end">
                        <span>Data: _____/_____/_________</span>
                        <div class="text-center">
                            <span class="inline-block border-t border-slate-700 px-12 pt-1 font-bold">${f.nome}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (tipoDocumentoAtual === 'recibo_ferias') {
        const feriasList = f.ferias || [];
        const fRecord = feriasList.find(item => item.status !== 'Cancelada') || (feriasList.length > 0 ? feriasList[0] : null);

        let paIni = '___/___/______';
        let paFim = '___/___/______';
        if (fRecord && fRecord.periodo_aquisitivo_inicio) {
            paIni = formatarData(fRecord.periodo_aquisitivo_inicio);
            paFim = formatarData(fRecord.periodo_aquisitivo_fim);
        } else if (f.diagnostico_ferias && f.diagnostico_ferias.ciclos && f.diagnostico_ferias.ciclos.length > 0) {
            const c0 = f.diagnostico_ferias.ciclos.find(c => c.dias_saldo > 0) || f.diagnostico_ferias.ciclos[0];
            paIni = c0.pa_inicio_br;
            paFim = c0.pa_fim_br;
        }

        const dtIni = fRecord ? formatarData(fRecord.data_inicio) : '___/___/______';
        const dtRet = fRecord ? formatarData(fRecord.data_retorno) : '___/___/______';
        const diasGozo = fRecord ? fRecord.dias : 30;
        const temAbono = fRecord && fRecord.abono_pecuniario;
        const diasAbono = temAbono ? 10 : 0;
        const tem13 = fRecord && fRecord.adiantamento_13;

        // Base Remuneratória rigorosa: Salário Função + Prêmio Assiduidade
        const salFuncao = parseFloat(f.salario_funcao || f.salario || 0);
        const premAssid = parseFloat(f.premio_assiduidade || 0);
        const remunTotal = parseFloat(f.salario_bruto || (salFuncao + premAssid));

        // Memória de Cálculos
        const valorDiasGozo = (remunTotal / 30) * diasGozo;
        const umTercoGozo = valorDiasGozo / 3;
        const valorAbono = temAbono ? (remunTotal / 30) * diasAbono : 0;
        const umTercoAbono = temAbono ? (valorAbono / 3) : 0;
        const adiant13 = tem13 ? (remunTotal / 2) : 0;

        const totalBruto = valorDiasGozo + umTercoGozo + valorAbono + umTercoAbono + adiant13;
        const inssDesc = calcularINSS(valorDiasGozo + umTercoGozo);
        const totalLiquido = Math.max(0, totalBruto - inssDesc);

        folha.innerHTML = `
            <div>
                <!-- CABEÇALHO OFICIAL COM LOGO -->
                <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-5">
                    <img src="/static/logo-dark.png" alt="Santos Manutenções" class="h-14 w-auto object-contain">
                    <div class="text-right">
                        <h2 class="text-xl font-black uppercase text-slate-900 tracking-wider">SANTOS MANUTENÇÃO</h2>
                        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">Salviano Silva Santos Manutenção</h3>
                        <p class="text-[10px] text-slate-500">CNPJ: Santos Manutenção &bull; Demonstrativo de Pagamento de Férias</p>
                    </div>
                </div>

                <!-- TÍTULO DO RECIBO -->
                <div class="text-center mb-5">
                    <h1 class="text-sm font-bold uppercase tracking-wide border-y-2 border-slate-800 py-1.5 inline-block px-6 bg-slate-50">
                        RECIBO DE PAGAMENTO DE FÉRIAS (ART. 145 DA CLT)
                    </h1>
                </div>

                <!-- DADOS CONTRATUAIS DO COLABORADOR -->
                <div class="border border-slate-300 p-2.5 rounded-lg mb-4 text-[11px] grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 bg-slate-50/70">
                    <div><strong>COLABORADOR:</strong> <span class="uppercase">${f.nome}</span></div>
                    <div><strong>MATRÍCULA:</strong> ${f.matricula || '---'}</div>
                    <div><strong>CARGO:</strong> ${f.cargo || '---'}</div>
                    <div><strong>CPF:</strong> ${f.cpf || '---'}</div>
                    <div><strong>RG:</strong> ${f.rg || '---'}</div>
                    <div><strong>ADMISSÃO:</strong> ${formatarData(f.admissao)}</div>
                    <div class="sm:col-span-2"><strong>PERÍODO AQUISITIVO:</strong> ${paIni} a ${paFim}</div>
                    <div><strong>GOZO:</strong> ${dtIni} a ${dtRet} (${diasGozo}d)</div>
                </div>

                <!-- DISCRIMINAÇÃO DAS VERBAS E CÁLCULO FINANCEIRO -->
                <div class="border border-slate-300 rounded-lg overflow-hidden mb-4">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead class="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                            <tr>
                                <th class="py-1.5 px-3 w-14">Cód.</th>
                                <th class="py-1.5 px-3">Descrição da Verba</th>
                                <th class="py-1.5 px-3 text-center w-24">Referência</th>
                                <th class="py-1.5 px-3 text-right w-28">Proventos (R$)</th>
                                <th class="py-1.5 px-3 text-right w-28">Descontos (R$)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 font-mono text-[11px]">
                            <tr>
                                <td class="py-1.5 px-3 font-bold text-slate-500">101</td>
                                <td class="py-1.5 px-3 font-sans font-semibold">FÉRIAS NORMAIS REMUNERADAS</td>
                                <td class="py-1.5 px-3 text-center">${diasGozo} dias</td>
                                <td class="py-1.5 px-3 text-right font-bold text-slate-800">${formatarMoeda(valorDiasGozo)}</td>
                                <td class="py-1.5 px-3 text-right text-slate-400">---</td>
                            </tr>
                            <tr>
                                <td class="py-1.5 px-3 font-bold text-slate-500">102</td>
                                <td class="py-1.5 px-3 font-sans font-semibold">1/3 CONSTITUCIONAL DE FÉRIAS (ART. 7º, XVII CF)</td>
                                <td class="py-1.5 px-3 text-center">33,33%</td>
                                <td class="py-1.5 px-3 text-right font-bold text-slate-800">${formatarMoeda(umTercoGozo)}</td>
                                <td class="py-1.5 px-3 text-right text-slate-400">---</td>
                            </tr>
                            ${temAbono ? `
                            <tr class="bg-amber-50/50">
                                <td class="py-1.5 px-3 font-bold text-amber-700">103</td>
                                <td class="py-1.5 px-3 font-sans font-semibold text-amber-900">ABONO PECUNIÁRIO (VENDA DE FÉRIAS - ART. 143 CLT)</td>
                                <td class="py-1.5 px-3 text-center">10 dias</td>
                                <td class="py-1.5 px-3 text-right font-bold text-slate-800">${formatarMoeda(valorAbono)}</td>
                                <td class="py-1.5 px-3 text-right text-slate-400">---</td>
                            </tr>
                            <tr class="bg-amber-50/50">
                                <td class="py-1.5 px-3 font-bold text-amber-700">104</td>
                                <td class="py-1.5 px-3 font-sans font-semibold text-amber-900">1/3 CONSTITUCIONAL SOBRE ABONO PECUNIÁRIO</td>
                                <td class="py-1.5 px-3 text-center">33,33%</td>
                                <td class="py-1.5 px-3 text-right font-bold text-slate-800">${formatarMoeda(umTercoAbono)}</td>
                                <td class="py-1.5 px-3 text-right text-slate-400">---</td>
                            </tr>
                            ` : ''}
                            ${tem13 ? `
                            <tr class="bg-blue-50/50">
                                <td class="py-1.5 px-3 font-bold text-blue-700">105</td>
                                <td class="py-1.5 px-3 font-sans font-semibold text-blue-900">ADIANTAMENTO DA 1ª PARCELA DO 13º SALÁRIO</td>
                                <td class="py-1.5 px-3 text-center">50,00%</td>
                                <td class="py-1.5 px-3 text-right font-bold text-slate-800">${formatarMoeda(adiant13)}</td>
                                <td class="py-1.5 px-3 text-right text-slate-400">---</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td class="py-1.5 px-3 font-bold text-rose-600">501</td>
                                <td class="py-1.5 px-3 font-sans text-rose-800 font-semibold">CONTRIBUIÇÃO PREVIDENCIÁRIA (INSS S/ FÉRIAS)</td>
                                <td class="py-1.5 px-3 text-center">Tabela Oficial</td>
                                <td class="py-1.5 px-3 text-right text-slate-400">---</td>
                                <td class="py-1.5 px-3 text-right font-bold text-rose-700">${formatarMoeda(inssDesc)}</td>
                            </tr>
                        </tbody>
                        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                            <tr>
                                <td colspan="3" class="py-2 px-3 text-right uppercase text-[10px] text-slate-600">TOTAIS:</td>
                                <td class="py-2 px-3 text-right text-slate-900 font-mono">${formatarMoeda(totalBruto)}</td>
                                <td class="py-2 px-3 text-right text-rose-700 font-mono">${formatarMoeda(inssDesc)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <!-- QUADRO DE VALOR LÍQUIDO -->
                <div class="bg-emerald-50 border-2 border-emerald-500 rounded-lg p-3 flex items-center justify-between mb-5">
                    <div>
                        <span class="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Remuneração Base de Cálculo</span>
                        <span class="text-xs text-slate-700">Salário Função: ${formatarMoeda(salFuncao)} &bull; Assiduidade: ${formatarMoeda(premAssid)}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">VALOR LÍQUIDO A RECEBER</span>
                        <span class="text-xl font-black text-emerald-700 font-mono">${formatarMoeda(totalLiquido)}</span>
                    </div>
                </div>

                <!-- TERMO DE QUITAÇÃO LEGAL -->
                <div class="p-3 bg-slate-50 border border-slate-300 rounded text-[10px] leading-relaxed text-justify text-slate-700 mb-6">
                    <strong>DECLARAÇÃO E RECIBO DE QUITAÇÃO:</strong> Recebi da empresa <strong>SANTOS MANUTENÇÃO</strong> a quantia líquida acima discriminada de <strong>${formatarMoeda(totalLiquido)}</strong>, referente ao pagamento das minhas férias relativas ao período aquisitivo supracitado, cumprido o prazo de pagamento estipulado pelo <strong>Artigo 145 da CLT</strong> (até dois dias antes do início do gozo), dando à empresa plena, rasa e geral quitação de tais verbas.
                </div>
            </div>

            <!-- ASSINATURAS -->
            <div class="pt-4 border-t border-slate-400 space-y-6">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-medium text-slate-700">Forma de Pagamento: <strong>Depósito Bancário / Chave PIX</strong></span>
                    <span class="font-bold text-slate-800">${dataHojeExtenso}</span>
                </div>

                <div class="grid grid-cols-2 gap-12 pt-6">
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-1.5">
                            <p class="font-bold text-xs uppercase">${f.nome}</p>
                            <p class="text-[10px] text-slate-600">CPF: ${f.cpf || '---'}</p>
                            <p class="text-[9px] text-slate-500 uppercase">Assinatura do Empregado / Quitação</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="border-t border-slate-800 pt-1.5">
                            <p class="font-bold text-xs uppercase">SANTOS MANUTENÇÃO</p>
                            <p class="text-[10px] text-slate-600">Recursos Humanos / Financeiro</p>
                            <p class="text-[9px] text-slate-500 uppercase">Visto do Empregador</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

function imprimirDocumentoAtual() {
    window.print();
}

// Mini form para adicionar EPI dinamicamente
function abrirMiniFormEPI() {
    document.getElementById('miniFormEPI').classList.remove('hidden');
    document.getElementById('epi_ca').focus();
}

function fecharMiniFormEPI() {
    document.getElementById('miniFormEPI').classList.add('hidden');
    document.getElementById('epi_ca').value = '';
    document.getElementById('epi_desc').value = '';
    document.getElementById('epi_qtd').value = '1';
}

async function salvarNovoEPI() {
    if (!colaboradorAtualDocumento) return;
    const ca = document.getElementById('epi_ca').value.trim();
    const qtd = parseInt(document.getElementById('epi_qtd').value) || 1;
    const desc = document.getElementById('epi_desc').value.trim();

    if (!desc) return alert('Informe a descrição do equipamento.');

    const body = {
        ca,
        quantidade: qtd,
        descricao: desc,
        data_entrega: new Date().toISOString().split('T')[0]
    };

    try {
        const res = await fetch(`/api/funcionarios/${colaboradorAtualDocumento.id}/epis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            fecharMiniFormEPI();
            // Recarrega colaborador
            const resF = await fetch(`/api/funcionarios/${colaboradorAtualDocumento.id}`);
            colaboradorAtualDocumento = await resF.json();
            renderizarFolhaA4();
            carregarFuncionarios();
        }
    } catch (err) {
        console.error('Erro ao salvar EPI:', err);
    }
}

// =========================================================================
// SINCRONIZAÇÃO / REIMPORTAR BASE
// =========================================================================
async function reimportarBase() {
    const icon = document.getElementById('syncIcon');
    icon.classList.add('fa-spin');

    try {
        const res = await fetch('/api/reimportar', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Sincronização realizada com sucesso!');
        carregarStats();
        carregarFuncionarios();
    } catch (err) {
        console.error('Erro ao sincronizar:', err);
        alert('Erro ao tentar sincronizar com a planilha.');
    } finally {
        icon.classList.remove('fa-spin');
    }
}

// =========================================================================
// HELPERS & MODAL UTILS
// =========================================================================
function abrirModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function fecharModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function formatarMoeda(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function formatarData(dtStr) {
    if (!dtStr) return '---';
    try {
        const [ano, mes, dia] = dtStr.split('-');
        if (ano && mes && dia) return `${dia}/${mes}/${ano}`;
        return dtStr;
    } catch (e) {
        return dtStr;
    }
}

function getDataHojePorExtenso(cidade) {
    const cid = cidade || 'Congonhas';
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const d = new Date();
    return `${cid} - MG, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// =========================================================================
// MÓDULO DE GESTÃO DE FÉRIAS CLT (DIAGNÓSTICO, AGENDAMENTO, IMPRESSÃO)
// =========================================================================
let colaboradorFeriasAtual = null;

async function abrirModalFerias(empId) {
    funcionarioAtualId = empId;
    try {
        const res = await fetch(`/api/funcionarios/${empId}/ferias`);
        const data = await res.json();
        if (data.error) return alert(data.error);

        colaboradorFeriasAtual = data;
        const f = data.funcionario;
        const diag = data.diagnostico;
        const historico = data.historico || [];

        // Subtítulo e cabeçalho
        const tempoEmp = calcularTempoEmpresa(f.admissao);
        document.getElementById('feriasFuncionarioSubtitulo').textContent = `${f.nome} | Mat: ${f.matricula || '---'} | Cargo: ${f.cargo || '---'} | Adm: ${formatarData(f.admissao)} (${tempoEmp})`;

        // Badge no topo do modal
        const badgeModal = document.getElementById('feriasStatusBadgeModal');
        badgeModal.textContent = diag.status_label;
        badgeModal.className = `px-2.5 py-0.5 rounded text-[11px] font-bold ${diag.badge_class}`;

        // Alerta Legal CLT Box
        const alertaBox = document.getElementById('feriasAlertaBox');
        const alertaIcon = document.getElementById('feriasAlertaIcon');
        const alertaTit = document.getElementById('feriasAlertaTitulo');
        const alertaDesc = document.getElementById('feriasAlertaDesc');

        alertaDesc.textContent = diag.alerta_texto;

        if (diag.status === 'VENCIDA') {
            alertaBox.className = 'p-4 rounded-xl border flex items-start space-x-3 bg-rose-50 border-rose-300 text-rose-950 animate-pulse';
            alertaIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-600 text-xl"></i>';
            alertaTit.textContent = '🚨 FÉRIAS VENCIDAS - SUJEITAS À DOBRA LEGAL (ART. 137 DA CLT)';
        } else if (diag.status === 'RISCO_DOBRAR') {
            alertaBox.className = 'p-4 rounded-xl border flex items-start space-x-3 bg-amber-50 border-amber-300 text-amber-950';
            alertaIcon.innerHTML = '<i class="fa-solid fa-clock-rotate-left text-amber-600 text-xl"></i>';
            alertaTit.textContent = `⚠️ ALERTA: RISCO DE DOBRA EM ${diag.dias_restantes_menor} DIAS (ART. 134 CLT)`;
        } else if (diag.status === 'EM_GOZO') {
            alertaBox.className = 'p-4 rounded-xl border flex items-start space-x-3 bg-purple-50 border-purple-300 text-purple-950';
            alertaIcon.innerHTML = '<i class="fa-solid fa-umbrella-beach text-purple-600 text-xl"></i>';
            alertaTit.textContent = '🏖️ COLABORADOR ATUALMENTE EM GOZO DE FÉRIAS';
        } else if (diag.status === 'AGENDADA') {
            alertaBox.className = 'p-4 rounded-xl border flex items-start space-x-3 bg-cyan-50 border-cyan-300 text-cyan-950';
            alertaIcon.innerHTML = '<i class="fa-solid fa-calendar-check text-cyan-600 text-xl"></i>';
            alertaTit.textContent = '📅 FÉRIAS PROGRAMADAS COM ANTECEDÊNCIA';
        } else if (diag.status === 'A_VENCER') {
            alertaBox.className = 'p-4 rounded-xl border flex items-start space-x-3 bg-blue-50 border-blue-200 text-blue-950';
            alertaIcon.innerHTML = '<i class="fa-solid fa-circle-check text-blue-600 text-xl"></i>';
            alertaTit.textContent = '🟡 PERÍODO AQUISITIVO COMPLETO (NO PRAZO CONCESSIVO)';
        } else {
            alertaBox.className = 'p-4 rounded-xl border flex items-start space-x-3 bg-emerald-50 border-emerald-200 text-emerald-950';
            alertaIcon.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600 text-xl"></i>';
            alertaTit.textContent = '🟢 FÉRIAS REGULARES / PERÍODO EM AQUISIÇÃO';
        }

        // Cards de Resumo
        const cicloVigente = diag.ciclos.find(c => c.dias_saldo > 0) || diag.ciclos[diag.ciclos.length - 1];
        if (cicloVigente) {
            document.getElementById('cardFeriasPA').textContent = `${cicloVigente.pa_inicio_br} a ${cicloVigente.pa_fim_br}`;
            document.getElementById('cardFeriasLimiteDobra').textContent = cicloVigente.pc_fim_br;
            document.getElementById('cardFeriasSaldo').textContent = `${cicloVigente.dias_saldo} dias`;

            if (cicloVigente.status_ciclo === 'VENCIDA') {
                document.getElementById('cardFeriasContagem').textContent = `Dobra há ${cicloVigente.dias_vencido}d`;
                document.getElementById('cardFeriasContagem').className = 'text-xs font-bold text-rose-600 mt-1';
                document.getElementById('cardFeriasContagemSub').textContent = 'Período concessivo expirado';
            } else if (cicloVigente.status_ciclo === 'EM_AQUISICAO') {
                document.getElementById('cardFeriasContagem').textContent = `Faltam ${cicloVigente.dias_para_vencer}d`;
                document.getElementById('cardFeriasContagem').className = 'text-xs font-bold text-slate-700 mt-1';
                document.getElementById('cardFeriasContagemSub').textContent = 'Para completar o direito';
            } else {
                document.getElementById('cardFeriasContagem').textContent = `Restam ${cicloVigente.dias_para_vencer}d`;
                document.getElementById('cardFeriasContagem').className = `text-xs font-bold ${cicloVigente.dias_para_vencer <= 60 ? 'text-amber-600' : 'text-emerald-700'} mt-1`;
                document.getElementById('cardFeriasContagemSub').textContent = 'Para término do prazo concessivo';
            }
        } else {
            document.getElementById('cardFeriasPA').textContent = '---';
            document.getElementById('cardFeriasLimiteDobra').textContent = '---';
            document.getElementById('cardFeriasSaldo').textContent = '0 dias';
            document.getElementById('cardFeriasContagem').textContent = '---';
        }

        // Preenche Tabela de Ciclos
        document.getElementById('totalCiclosLabel').textContent = `${diag.ciclos.length} ciclo(s) registrado(s)`;
        const tbodyCiclos = document.getElementById('tabelaCiclosFerias');
        if (diag.ciclos.length === 0) {
            tbodyCiclos.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-400">Sem histórico de ciclos (admissão não informada).</td></tr>`;
        } else {
            tbodyCiclos.innerHTML = diag.ciclos.map(c => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="py-2 px-3 font-bold text-slate-700">Ciclo #${c.ciclo_num}</td>
                    <td class="py-2 px-3 font-medium text-slate-800">${c.pa_inicio_br} até ${c.pa_fim_br}</td>
                    <td class="py-2 px-3 font-medium text-slate-600">${c.pc_inicio_br} até <span class="font-bold text-slate-900">${c.pc_fim_br}</span></td>
                    <td class="py-2 px-2 text-center font-bold text-slate-700">${c.dias_gozados + c.dias_agendados + c.dias_abono} dias</td>
                    <td class="py-2 px-2 text-center font-black ${c.dias_saldo > 0 ? 'text-teal-700' : 'text-slate-400'}">${c.dias_saldo}d</td>
                    <td class="py-2 px-3">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] ${c.badge_class}">
                            ${c.status_ciclo_label}
                        </span>
                    </td>
                    <td class="py-2 px-3 text-right">
                        ${c.dias_saldo > 0 ? `
                            <button type="button" onclick="abrirModalBaixaFerias(${c.ciclo_num})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold shadow-xs transition inline-flex items-center">
                                <i class="fa-solid fa-check mr-1"></i> Já Tirou Férias
                            </button>
                        ` : `
                            <span class="inline-flex items-center text-emerald-700 font-bold text-[11px]">
                                <i class="fa-solid fa-check-double mr-1"></i> Gozada / Regular
                            </span>
                        `}
                    </td>
                </tr>
            `).join('');
        }

        // Controla botão Quitar Todas as Vencidas
        const btnQuitar = document.getElementById('btnQuitarTodasVencidas');
        if (btnQuitar) {
            const temCicloVencido = diag.ciclos && diag.ciclos.some(c => c.status_ciclo === 'VENCIDA' && c.dias_saldo > 0);
            if (temCicloVencido) {
                btnQuitar.classList.remove('hidden');
            } else {
                btnQuitar.classList.add('hidden');
            }
        }

        // Preenche Tabela de Férias Programadas
        document.getElementById('totalFeriasAgendadasBadge').textContent = `${historico.length} registro(s)`;
        const tbodyHistorico = document.getElementById('listaFeriasTabela');
        if (historico.length === 0) {
            tbodyHistorico.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Nenhum agendamento de férias registrado para este colaborador.</td></tr>`;
        } else {
            tbodyHistorico.innerHTML = historico.map(h => {
                let badgeStatus = 'bg-slate-100 text-slate-700';
                if (h.status === 'Em Gozo') badgeStatus = 'bg-purple-100 text-purple-800 font-bold border border-purple-300';
                else if (h.status === 'Agendada') badgeStatus = 'bg-cyan-100 text-cyan-800 font-bold border border-cyan-300';
                else if (h.status === 'Concluída') badgeStatus = 'bg-emerald-100 text-emerald-800 border border-emerald-300';

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="py-2.5 px-3 font-bold text-slate-800">${formatarData(h.data_inicio)}</td>
                        <td class="py-2.5 px-2 text-center font-extrabold text-teal-800">${h.dias} dias</td>
                        <td class="py-2.5 px-3 font-semibold text-slate-700">${formatarData(h.data_retorno)}</td>
                        <td class="py-2.5 px-3 text-[11px] text-slate-600">
                            ${h.abono_pecuniario ? '<span class="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 mr-1"><i class="fa-solid fa-coins mr-1"></i>Abono 10d</span>' : ''}
                            ${h.adiantamento_13 ? '<span class="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200"><i class="fa-solid fa-calendar mr-1"></i>13º Antecipado</span>' : ''}
                            ${!h.abono_pecuniario && !h.adiantamento_13 ? '<span class="text-slate-400 font-mono">Padrão</span>' : ''}
                        </td>
                        <td class="py-2.5 px-3">
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] ${badgeStatus}">
                                ${h.status || 'Agendada'}
                            </span>
                        </td>
                        <td class="py-2.5 px-3 text-right">
                            <div class="inline-flex items-center space-x-1.5">
                                <button type="button" onclick="abrirDocumento(${f.id}, 'aviso_ferias')" title="Imprimir Aviso Prévio" class="px-2 py-1 bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-800 rounded text-[11px] font-semibold border border-amber-200 transition">
                                    <i class="fa-solid fa-print mr-1"></i> Aviso
                                </button>
                                <button type="button" onclick="abrirDocumento(${f.id}, 'recibo_ferias')" title="Imprimir Recibo de Pagamento" class="px-2 py-1 bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-800 rounded text-[11px] font-semibold border border-teal-200 transition">
                                    <i class="fa-solid fa-receipt mr-1"></i> Recibo
                                </button>
                                <button type="button" onclick="excluirFerias(${h.id})" title="Cancelar Agendamento" class="w-6 h-6 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded flex items-center justify-center transition">
                                    <i class="fa-solid fa-trash-can text-xs"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Configuração inicial do formulário
        const hojeStr = new Date().toISOString().split('T')[0];
        document.getElementById('ferias_inicio').value = hojeStr;
        document.getElementById('ferias_dias').value = 30;
        document.getElementById('ferias_abono').checked = false;
        document.getElementById('ferias_adiantamento_13').checked = false;
        document.getElementById('ferias_obs').value = '';
        calcularRetornoFerias();

        abrirModal('modalFerias');
    } catch (err) {
        console.error('Erro ao abrir modal de férias:', err);
        alert('Erro ao carregar dados de férias do colaborador.');
    }
}

function setDiasFerias(dias) {
    document.getElementById('ferias_dias').value = dias;
    if (dias <= 20 && !document.getElementById('ferias_abono').checked) {
        // Se usuário escolheu 20 dias, pode sugerir o abono de 10 dias
    }
    calcularRetornoFerias();
}

function toggleAbonoOptions() {
    const abonoChecked = document.getElementById('ferias_abono').checked;
    const diasInput = document.getElementById('ferias_dias');
    if (abonoChecked && parseInt(diasInput.value) > 20) {
        diasInput.value = 20;
        calcularRetornoFerias();
    }
}

function calcularRetornoFerias() {
    const dtIni = document.getElementById('ferias_inicio').value;
    const dias = parseInt(document.getElementById('ferias_dias').value) || 30;
    const dicaDsr = document.getElementById('dicaInicioFerias');

    if (!dtIni) {
        document.getElementById('ferias_retorno').value = '';
        return;
    }

    try {
        const [ano, mes, dia] = dtIni.split('-').map(Number);
        const dataInicio = new Date(ano, mes - 1, dia);

        // Alerta de DSR: sexta-feira (5) ou quinta-feira (4)
        const diaSemana = dataInicio.getDay();
        if (diaSemana === 5 || diaSemana === 6) {
            dicaDsr.innerHTML = `<span class="text-amber-600 font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Atenção CLT Art. 134 §3º: Início vedado 2 dias antes do DSR.</span>`;
        } else {
            dicaDsr.innerHTML = `<span class="text-slate-500">Início permitido conforme regras da CLT.</span>`;
        }

        const dataRetorno = new Date(ano, mes - 1, dia + dias);
        const aRet = dataRetorno.getFullYear();
        const mRet = String(dataRetorno.getMonth() + 1).padStart(2, '0');
        const dRet = String(dataRetorno.getDate()).padStart(2, '0');

        const retornoIso = `${aRet}-${mRet}-${dRet}`;
        document.getElementById('ferias_retorno').value = retornoIso;
        document.getElementById('retornoCalculadoTexto').textContent = `Retorno ao trabalho em: ${dRet}/${mRet}/${aRet}`;
    } catch (e) {
        console.error(e);
    }
}

async function salvarAgendamentoFerias(e) {
    e.preventDefault();
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.funcionario) return;

    const fId = colaboradorFeriasAtual.funcionario.id;
    const dtInicio = document.getElementById('ferias_inicio').value;
    const dias = parseInt(document.getElementById('ferias_dias').value) || 30;
    const dtRetorno = document.getElementById('ferias_retorno').value;
    const abono = document.getElementById('ferias_abono').checked ? 1 : 0;
    const adiant13 = document.getElementById('ferias_adiantamento_13').checked ? 1 : 0;
    const obs = document.getElementById('ferias_obs').value.trim();

    if (!dtInicio) return alert('Selecione a data de início das férias.');
    if (dias < 5 || dias > 30) return alert('A quantidade de dias deve ser entre 5 e 30 dias (Art. 134 CLT).');

    const cicloVigente = colaboradorFeriasAtual.diagnostico.ciclos.find(c => c.dias_saldo > 0) || colaboradorFeriasAtual.diagnostico.ciclos[0];

    const payload = {
        data_inicio: dtInicio,
        dias: dias,
        data_retorno: dtRetorno,
        abono_pecuniario: abono,
        dias_abono: abono ? 10 : 0,
        adiantamento_13: adiant13,
        periodo_aquisitivo_inicio: cicloVigente ? cicloVigente.pa_inicio : '',
        periodo_aquisitivo_fim: cicloVigente ? cicloVigente.pa_fim : '',
        periodo_concessivo_fim: cicloVigente ? cicloVigente.pc_fim : '',
        observacoes: obs
    };

    try {
        const res = await fetch(`/api/funcionarios/${fId}/ferias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resp = await res.json();
        if (res.ok) {
            alert('Férias agendadas com sucesso!');
            abrirModalFerias(fId);
            carregarStats();
            carregarFuncionarios();
        } else {
            alert(resp.error || 'Erro ao agendar férias.');
        }
    } catch (err) {
        console.error('Erro ao agendar férias:', err);
        alert('Falha ao conectar com o servidor.');
    }
}

async function excluirFerias(feriasId) {
    if (!confirm('Deseja realmente cancelar este registro de férias? O saldo de dias será recalculado.')) return;

    try {
        const res = await fetch(`/api/ferias/${feriasId}`, { method: 'DELETE' });
        const resp = await res.json();
        if (res.ok) {
            if (colaboradorFeriasAtual && colaboradorFeriasAtual.funcionario) {
                abrirModalFerias(colaboradorFeriasAtual.funcionario.id);
            }
            carregarStats();
            carregarFuncionarios();
        } else {
            alert(resp.error || 'Erro ao cancelar férias.');
        }
    } catch (err) {
        console.error('Erro ao excluir férias:', err);
    }
}

function imprimirAvisoFeriasColaborador() {
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.funcionario) return;
    abrirDocumento(colaboradorFeriasAtual.funcionario.id, 'aviso_ferias');
}

function imprimirReciboFeriasColaborador() {
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.funcionario) return;
    abrirDocumento(colaboradorFeriasAtual.funcionario.id, 'recibo_ferias');
}

// =========================================================================
// GESTÃO DE BAIXA DE FÉRIAS JÁ GOZADAS (ABATER DO ACUMULADO)
// =========================================================================
let cicloBaixaAtual = null;

function abrirModalBaixaFerias(cicloNum) {
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.diagnostico) return;
    const ciclo = colaboradorFeriasAtual.diagnostico.ciclos.find(c => c.ciclo_num === cicloNum);
    if (!ciclo) return;

    cicloBaixaAtual = ciclo;
    const f = colaboradorFeriasAtual.funcionario;

    document.getElementById('baixaModalTitulo').textContent = `Marcar Férias Gozadas - Ciclo #${ciclo.ciclo_num}`;
    document.getElementById('baixaModalSubtitulo').textContent = `${f.nome} (Saldo atual: ${ciclo.dias_saldo} dias)`;
    document.getElementById('baixaCicloNome').textContent = `Ciclo #${ciclo.ciclo_num} (Direito: ${ciclo.dias_direito} dias)`;
    document.getElementById('baixaSaldoAtualBadge').textContent = `Saldo: ${ciclo.dias_saldo} dias`;
    document.getElementById('baixaPaDatas').textContent = `${ciclo.pa_inicio_br} a ${ciclo.pa_fim_br}`;
    document.getElementById('baixaPcFim').textContent = ciclo.pc_fim_br;

    const diasSugestao = Math.min(ciclo.dias_saldo, 30);
    const inputDias = document.getElementById('baixa_dias');
    inputDias.value = diasSugestao;
    inputDias.max = ciclo.dias_saldo;

    // Sugere a data inicial como início do período concessivo
    const dataSugestao = ciclo.pc_inicio_str || ciclo.pc_inicio || '';
    document.getElementById('baixa_data_inicio').value = dataSugestao;
    document.getElementById('baixa_abono').checked = false;
    document.getElementById('baixa_obs').value = `Férias gozadas no período regular (baixa Ciclo #${ciclo.ciclo_num})`;

    calcularRetornoBaixa();
    abrirModal('modalDarBaixaFerias');
}

function setDiasBaixa(dias) {
    if (!cicloBaixaAtual) return;
    const maxDias = cicloBaixaAtual.dias_saldo;
    document.getElementById('baixa_dias').value = Math.min(dias, maxDias);
    calcularRetornoBaixa();
}

function toggleAbonoBaixa() {
    const abonoChecked = document.getElementById('baixa_abono').checked;
    const diasInput = document.getElementById('baixa_dias');
    if (abonoChecked && parseInt(diasInput.value) > 20) {
        diasInput.value = 20;
    }
    calcularRetornoBaixa();
}

function calcularRetornoBaixa() {
    const dtIni = document.getElementById('baixa_data_inicio').value;
    const dias = parseInt(document.getElementById('baixa_dias').value) || 0;
    const spanRetorno = document.getElementById('baixaRetornoTexto');

    if (!dtIni || dias <= 0) {
        spanRetorno.textContent = '--';
        return;
    }

    try {
        const [ano, mes, dia] = dtIni.split('-').map(Number);
        const dt = new Date(ano, mes - 1, dia + dias);
        const aRet = dt.getFullYear();
        const mRet = String(dt.getMonth() + 1).padStart(2, '0');
        const dRet = String(dt.getDate()).padStart(2, '0');
        spanRetorno.textContent = `${dRet}/${mRet}/${aRet}`;
    } catch (e) {
        spanRetorno.textContent = '--';
    }
}

async function salvarBaixaFeriasCiclo(e) {
    e.preventDefault();
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.funcionario || !cicloBaixaAtual) return;

    const fId = colaboradorFeriasAtual.funcionario.id;
    const dtInicio = document.getElementById('baixa_data_inicio').value;
    const dias = parseInt(document.getElementById('baixa_dias').value) || 0;
    const abono = document.getElementById('baixa_abono').checked ? 1 : 0;
    const obs = document.getElementById('baixa_obs').value.trim();

    if (!dtInicio) return alert('Selecione a data em que o colaborador tirou férias.');
    if (dias <= 0 || dias > cicloBaixaAtual.dias_saldo) {
        return alert(`A quantidade de dias deve ser entre 1 e ${cicloBaixaAtual.dias_saldo} dias.`);
    }

    const [ano, mes, dia] = dtInicio.split('-').map(Number);
    const dtRet = new Date(ano, mes - 1, dia + dias);
    const dtRetornoStr = `${dtRet.getFullYear()}-${String(dtRet.getMonth() + 1).padStart(2, '0')}-${String(dtRet.getDate()).padStart(2, '0')}`;

    const payload = {
        data_inicio: dtInicio,
        dias: dias,
        data_retorno: dtRetornoStr,
        abono_pecuniario: abono,
        dias_abono: abono ? 10 : 0,
        adiantamento_13: 0,
        periodo_aquisitivo_inicio: cicloBaixaAtual.pa_inicio_str || cicloBaixaAtual.pa_inicio,
        periodo_aquisitivo_fim: cicloBaixaAtual.pa_fim_str || cicloBaixaAtual.pa_fim,
        periodo_concessivo_fim: cicloBaixaAtual.pc_fim_str || cicloBaixaAtual.pc_fim,
        status: 'Concluída',
        observacoes: obs || `Férias já gozadas no período regular (baixa Ciclo #${cicloBaixaAtual.ciclo_num})`
    };

    try {
        const res = await fetch(`/api/funcionarios/${fId}/ferias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const resp = await res.json();
        if (res.ok) {
            fecharModal('modalDarBaixaFerias');
            abrirModalFerias(fId);
            carregarStats();
            carregarFuncionarios();
        } else {
            alert(resp.error || 'Erro ao registrar baixa de férias.');
        }
    } catch (err) {
        console.error('Erro ao salvar baixa de férias:', err);
        alert('Falha ao conectar com o servidor.');
    }
}

async function executarBaixaRapidaAtual() {
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.funcionario || !cicloBaixaAtual) return;
    const saldo = cicloBaixaAtual.dias_saldo;
    if (saldo <= 0) return alert('Este ciclo já não possui saldo pendente.');

    const diasBaixa = Math.min(saldo, 30);
    document.getElementById('baixa_dias').value = diasBaixa;
    calcularRetornoBaixa();

    const form = document.getElementById('formBaixaFerias');
    if (form.reportValidity()) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
}

async function quitarTodasFeriasVencidas() {
    if (!colaboradorFeriasAtual || !colaboradorFeriasAtual.funcionario) return;
    const f = colaboradorFeriasAtual.funcionario;
    const fId = f.id;

    if (!confirm(`Atenção: Deseja marcar como JÁ GOZADAS todas as férias vencidas de ${f.nome}?\n\nIsso dará baixa no saldo acumulado de todos os ciclos em atraso, regularizando a situação do colaborador.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/funcionarios/${fId}/ferias/quitar-vencidas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const resp = await res.json();
        if (res.ok) {
            alert(resp.message || 'Férias vencidas quitadas com sucesso!');
            abrirModalFerias(fId);
            carregarStats();
            carregarFuncionarios();
        } else {
            alert(resp.error || 'Erro ao quitar férias vencidas.');
        }
    } catch (err) {
        console.error('Erro ao quitar férias vencidas:', err);
        alert('Falha ao conectar com o servidor.');
    }
}

function calcularINSS(base) {
    if (!base || base <= 0) return 0;
    if (base <= 1412.00) return base * 0.075;
    if (base <= 2666.68) return (base * 0.09) - 21.18;
    if (base <= 4000.03) return (base * 0.12) - 101.18;
    if (base <= 7786.02) return (base * 0.14) - 181.18;
    return 908.86;
}

function calcularTempoEmpresa(admStr) {
    if (!admStr) return 'Recente';
    try {
        const [ano, mes, dia] = admStr.split('-').map(Number);
        const adm = new Date(ano, mes - 1, dia);
        const hoje = new Date();
        let anos = hoje.getFullYear() - adm.getFullYear();
        let meses = hoje.getMonth() - adm.getMonth();
        if (meses < 0) {
            anos--;
            meses += 12;
        }
        if (anos === 0) return `${meses} meses`;
        if (meses === 0) return `${anos} ano(s)`;
        return `${anos}a ${meses}m`;
    } catch (e) {
        return '';
    }
}

// =========================================================================
// MÓDULO DE GESTÃO DE CONTRACHEQUES & ACESSO AO PORTAL
// =========================================================================
let colaboradorContrachequeAtual = null;

async function abrirModalContracheques(funcionarioId) {
    try {
        const res = await fetch(`/api/funcionarios/${funcionarioId}`);
        const f = await res.json();
        if (f.error) return alert(f.error);

        colaboradorContrachequeAtual = f;

        // Subtítulo
        document.getElementById('ccFuncionarioSubtitulo').textContent = 
            `${f.nome} | Matrícula: ${f.matricula || '---'} | CPF: ${f.cpf || 'Não informado'} | Cargo: ${f.cargo || '---'}`;

        // Info Login & Senha
        document.getElementById('ccInfoLogin').textContent = f.cpf || f.matricula || '---';
        const badgeSenha = document.getElementById('ccStatusSenhaBadge');
        if (f.senha_alterada) {
            badgeSenha.className = 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800';
            badgeSenha.innerHTML = '<i class="fa-solid fa-lock mr-1 text-emerald-600"></i>Senha Personalizada pelo Usuário';
        } else {
            badgeSenha.className = 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800';
            badgeSenha.innerHTML = '<i class="fa-solid fa-key mr-1 text-amber-600"></i>Senha Padrão (4 Primeiros Dígitos do CPF)';
        }

        // Reset Formulário
        document.getElementById('formContracheque').reset();
        const d = new Date();
        document.getElementById('cc_ano').value = d.getFullYear();
        document.getElementById('cc_mes').value = d.getMonth() + 1;
        document.getElementById('cc_nome_arquivo_display').textContent = 'Clique para selecionar o arquivo (PDF, JPG, PNG)';
        document.getElementById('cc_nome_arquivo_display').className = 'text-xs font-semibold text-slate-600';

        // Carregar Lista
        await carregarListaContracheques(funcionarioId);

        abrirModal('modalContracheques');
    } catch (err) {
        console.error('Erro ao abrir modal de contracheques:', err);
        alert('Falha ao carregar dados do colaborador.');
    }
}

async function carregarListaContracheques(funcionarioId) {
    const tbody = document.getElementById('listaContrachequesTabela');
    const badge = document.getElementById('ccTotalBadge');

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="py-6 text-center text-slate-400">
                <i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Carregando holerites...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`/api/funcionarios/${funcionarioId}/contracheques`);
        const lista = await res.json();

        badge.textContent = `${lista.length} holerite(s)`;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-slate-400">
                        <i class="fa-solid fa-folder-open text-2xl text-slate-300 mb-2"></i>
                        <p>Nenhum contracheque anexado para este colaborador.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = lista.map(c => {
            const tamFmt = c.tamanho_bytes ? (c.tamanho_bytes > 1048576 ? `${(c.tamanho_bytes / 1048576).toFixed(1)} MB` : `${Math.round(c.tamanho_bytes / 1024)} KB`) : '---';
            const valFmt = c.valor_liquido ? formatarMoeda(c.valor_liquido) : '<span class="text-slate-400">---</span>';
            const dtEnvioFmt = c.created_at ? formatarData(c.created_at.split(' ')[0]) : '---';
            const isPdf = c.arquivo_path.toLowerCase().endsWith('.pdf');
            const fileIcon = isPdf ? 'fa-file-pdf text-rose-500' : 'fa-file-image text-blue-500';

            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="py-2.5 px-4 font-bold text-slate-800">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            📅 ${c.competencia}
                        </span>
                        ${c.observacoes ? `<div class="text-[10px] text-slate-400 font-normal mt-0.5">${c.observacoes}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="flex items-center space-x-1.5 font-medium text-slate-700 truncate max-w-[200px]" title="${c.nome_arquivo}">
                            <i class="fa-solid ${fileIcon}"></i>
                            <span class="truncate">${c.nome_arquivo}</span>
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-slate-500 font-mono text-[11px]">${tamFmt}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-700">${valFmt}</td>
                    <td class="py-2.5 px-3 text-slate-500 text-[11px]">${dtEnvioFmt}</td>
                    <td class="py-2.5 px-4 text-right space-x-1">
                        <a href="/api/contracheques/${c.id}/download?inline=1" target="_blank" title="Visualizar Holerite" class="inline-flex items-center px-2 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded text-[11px] font-semibold transition">
                            <i class="fa-solid fa-eye mr-1"></i> Ver
                        </a>
                        <a href="/api/contracheques/${c.id}/download" download title="Baixar Arquivo" class="inline-flex items-center px-2 py-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded text-[11px] font-semibold transition">
                            <i class="fa-solid fa-download mr-1"></i> Baixar
                        </a>
                        <button type="button" onclick="excluirContracheque(${c.id})" title="Excluir Contracheque" class="inline-flex items-center px-2 py-1 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 rounded text-[11px] font-semibold transition">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Erro ao listar contracheques:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-500">Falha ao carregar contracheques.</td></tr>`;
    }
}

function atualizarDisplayArquivoContracheque(input) {
    const display = document.getElementById('cc_nome_arquivo_display');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        display.textContent = `Selecionado: ${file.name} (${Math.round(file.size / 1024)} KB)`;
        display.className = 'text-xs font-bold text-emerald-700';
    } else {
        display.textContent = 'Clique para selecionar o arquivo (PDF, JPG, PNG)';
        display.className = 'text-xs font-semibold text-slate-600';
    }
}

async function salvarNovoContracheque(e) {
    e.preventDefault();
    if (!colaboradorContrachequeAtual) return;

    const fileInput = document.getElementById('cc_input_arquivo');
    if (!fileInput.files || !fileInput.files[0]) {
        return alert('Por favor, selecione o arquivo do contracheque (PDF ou Imagem).');
    }

    const file = fileInput.files[0];
    const mes = parseInt(document.getElementById('cc_mes').value);
    const ano = parseInt(document.getElementById('cc_ano').value);
    const nomesMeses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º Salário'];
    const competencia = mes === 13 ? `13º Salário / ${ano}` : `${nomesMeses[mes]} / ${ano}`;
    const valorLiq = parseFloat(document.getElementById('cc_valor_liquido').value) || 0;
    const obs = document.getElementById('cc_obs').value.trim();

    const btnSalvar = document.getElementById('btnSalvarContracheque');
    const btnTextoOriginal = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Enviando...`;

    try {
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const payload = {
            ano: ano,
            mes: mes,
            competencia: competencia,
            nome_arquivo: file.name,
            tipo_arquivo: file.type || 'application/pdf',
            arquivo_base64: base64Data,
            valor_liquido: valorLiq,
            observacoes: obs
        };

        const res = await fetch(`/api/funcionarios/${colaboradorContrachequeAtual.id}/contracheques`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resp = await res.json();
        if (res.ok) {
            alert('Contracheque anexado com sucesso e já disponível no Portal do Colaborador!');
            document.getElementById('formContracheque').reset();
            document.getElementById('cc_nome_arquivo_display').textContent = 'Clique para selecionar o arquivo (PDF, JPG, PNG)';
            document.getElementById('cc_nome_arquivo_display').className = 'text-xs font-semibold text-slate-600';
            await carregarListaContracheques(colaboradorContrachequeAtual.id);
            carregarFuncionarios();
        } else {
            alert(resp.error || 'Erro ao anexar contracheque.');
        }
    } catch (err) {
        console.error('Erro no upload do contracheque:', err);
        alert('Falha ao processar arquivo para envio.');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = btnTextoOriginal;
    }
}

async function excluirContracheque(ccId) {
    if (!confirm('Deseja realmente excluir este contracheque? O arquivo será removido do sistema e do Portal do Colaborador.')) return;

    try {
        const res = await fetch(`/api/contracheques/${ccId}`, { method: 'DELETE' });
        const resp = await res.json();
        if (res.ok) {
            if (colaboradorContrachequeAtual) {
                await carregarListaContracheques(colaboradorContrachequeAtual.id);
            }
            carregarFuncionarios();
        } else {
            alert(resp.error || 'Erro ao excluir contracheque.');
        }
    } catch (err) {
        console.error('Erro ao excluir:', err);
    }
}

async function redefinirSenhaColaboradorAtual() {
    if (!colaboradorContrachequeAtual) return;
    if (!confirm(`Deseja redefinir a senha de acesso ao Portal para ${colaboradorContrachequeAtual.nome}?\n\nA senha voltará a ser o padrão inicial: os 4 primeiros dígitos do CPF.`)) return;

    try {
        const res = await fetch(`/api/funcionarios/${colaboradorContrachequeAtual.id}/reset-senha`, { method: 'POST' });
        const resp = await res.json();
        if (res.ok) {
            alert(resp.message || 'Senha redefinida com sucesso!');
            abrirModalContracheques(colaboradorContrachequeAtual.id);
        } else {
            alert(resp.error || 'Erro ao redefinir senha.');
        }
    } catch (err) {
        console.error('Erro ao redefinir senha:', err);
    }
}

// =========================================================================
// MÓDULO DE ANEXAÇÃO EM LOTE DE CONTRACHEQUES COM RECONHECIMENTO AUTOMÁTICO
// =========================================================================
let filaArquivosLote = [];
let colaboradoresLoteCache = [];
let uploadLoteEmAndamento = false;
let resumoCompetenciaAtual = null;

async function consultarResumoCompetenciaLote() {
    const selAno = document.getElementById('lote_ano');
    const selMes = document.getElementById('lote_mes');
    const textoMesAno = document.getElementById('textoMesAnoResumoLote');
    const badgeExistentes = document.getElementById('badgeContrachequesExistentesMes');
    const btnExcluir = document.getElementById('btnExcluirLoteMes');
    const btnTextoExcluir = document.getElementById('btnExcluirLoteMesTexto');

    if (!selAno || !selMes) return;
    const ano = parseInt(selAno.value);
    const mes = parseInt(selMes.value);

    const nomesMeses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º Salário'];
    const compLabel = mes === 13 ? `13º Salário / ${ano}` : `${nomesMeses[mes]} / ${ano}`;

    if (textoMesAno) textoMesAno.textContent = compLabel;
    if (badgeExistentes) {
        badgeExistentes.className = 'ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] bg-slate-200 text-slate-700';
        badgeExistentes.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-slate-500 mr-1"></i> Consultando...';
    }
    if (btnExcluir) btnExcluir.classList.add('hidden');

    try {
        const res = await fetch(`/api/contracheques/resumo-competencia?ano=${ano}&mes=${mes}`);
        const data = await res.json();
        resumoCompetenciaAtual = data;

        if (data.total > 0) {
            if (badgeExistentes) {
                badgeExistentes.className = 'ml-1.5 inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-amber-100 text-amber-900 border border-amber-300';
                badgeExistentes.innerHTML = `<i class="fa-solid fa-circle-check text-amber-600 mr-1"></i> ${data.total} contracheque(s) postado(s) (${data.total_funcionarios} colaborador${data.total_funcionarios > 1 ? 'es' : ''})`;
            }
            if (btnExcluir) {
                btnExcluir.classList.remove('hidden');
                if (btnTextoExcluir) {
                    btnTextoExcluir.textContent = `Apagar Todos os ${data.total} deste Mês`;
                }
            }
        } else {
            if (badgeExistentes) {
                badgeExistentes.className = 'ml-1.5 inline-flex items-center px-2.5 py-0.5 rounded-full font-medium text-[11px] bg-slate-100 text-slate-600 border border-slate-200';
                badgeExistentes.textContent = 'Nenhum contracheque postado neste mês';
            }
            if (btnExcluir) btnExcluir.classList.add('hidden');
        }
    } catch (err) {
        console.error('Erro ao consultar resumo de contracheques do mês:', err);
        if (badgeExistentes) {
            badgeExistentes.textContent = 'Não foi possível verificar';
        }
    }
}

function aoMudarCompetenciaLote() {
    consultarResumoCompetenciaLote();
}

async function confirmarExcluirContrachequesMes() {
    const selAno = document.getElementById('lote_ano');
    const selMes = document.getElementById('lote_mes');
    if (!selAno || !selMes) return;
    const ano = parseInt(selAno.value);
    const mes = parseInt(selMes.value);

    const nomesMeses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º Salário'];
    const compLabel = mes === 13 ? `13º Salário / ${ano}` : `${nomesMeses[mes]} / ${ano}`;

    const totalAtual = (resumoCompetenciaAtual && resumoCompetenciaAtual.total) ? resumoCompetenciaAtual.total : 'todos os';

    const msgConfirmacao = `🚨 ATENÇÃO: Deseja realmente APAGAR TODOS os ${totalAtual} contracheques da competência ${compLabel} de TODOS os funcionários?\n\n` +
        `• Esta ação é IRREVERSÍVEL.\n` +
        `• Todos os arquivos físicos serão apagados do servidor.\n` +
        `• Os contracheques serão removidos imediatamente do Portal do Colaborador.\n\n` +
        `Digite 'EXCLUIR' para confirmar a exclusão em massa:`;

    const confirmacao = prompt(msgConfirmacao);
    if (!confirmacao || confirmacao.trim().toUpperCase() !== 'EXCLUIR') {
        if (confirmacao !== null) {
            alert('Ação cancelada. A palavra de confirmação não confere.');
        }
        return;
    }

    const btnExcluir = document.getElementById('btnExcluirLoteMes');
    const btnTexto = document.getElementById('btnExcluirLoteMesTexto');
    const textoOriginal = btnTexto ? btnTexto.textContent : 'Apagar Todos do Mês';

    if (btnExcluir) btnExcluir.disabled = true;
    if (btnTexto) btnTexto.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Apagando...';

    try {
        const res = await fetch(`/api/contracheques/em-lote?ano=${ano}&mes=${mes}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (res.ok) {
            alert(`Sucesso!\n\n${data.message}`);
            await consultarResumoCompetenciaLote();
            carregarFuncionarios();
            carregarStats();
        } else {
            alert(data.error || 'Falha ao excluir contracheques em lote.');
        }
    } catch (err) {
        console.error('Erro na exclusão em lote:', err);
        alert('Erro de comunicação com o servidor ao excluir contracheques.');
    } finally {
        if (btnExcluir) btnExcluir.disabled = false;
        if (btnTexto) btnTexto.textContent = textoOriginal;
    }
}

function abrirModalUploadLote() {
    filaArquivosLote = [];
    colaboradoresLoteCache = [];
    uploadLoteEmAndamento = false;

    // Reset Dropzone & Inputs
    const inputArq = document.getElementById('inputArquivosLote');
    if (inputArq) inputArq.value = '';

    // Data padrão (ano atual, mês atual)
    const d = new Date();
    const selAno = document.getElementById('lote_ano');
    const selMes = document.getElementById('lote_mes');
    if (selAno) selAno.value = d.getFullYear();
    if (selMes) selMes.value = d.getMonth() + 1;

    // Reset Painéis
    const painelRevisao = document.getElementById('painelRevisaoLote');
    const painelProgresso = document.getElementById('painelProgressoLote');
    const btnLimpar = document.getElementById('btnLimparFilaLote');
    const btnConfirmar = document.getElementById('btnConfirmarEnvioLote');
    const btnTexto = document.getElementById('btnConfirmarEnvioLoteTexto');

    if (painelRevisao) painelRevisao.classList.add('hidden');
    if (painelProgresso) painelProgresso.classList.add('hidden');
    if (btnLimpar) btnLimpar.classList.add('hidden');
    if (btnConfirmar) btnConfirmar.disabled = true;
    if (btnTexto) btnTexto.textContent = 'Confirmar e Enviar para os Colaboradores';

    const tbody = document.getElementById('listaConciliacaoLoteTabela');
    if (tbody) tbody.innerHTML = '';

    // Consulta status dos contracheques para a competência selecionada
    consultarResumoCompetenciaLote();

    abrirModal('modalUploadLoteContracheques');
}

function aoArrastarSobreDropzone(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('dropzoneLote');
    if (dz) {
        dz.classList.add('border-emerald-500', 'bg-emerald-50/60');
    }
}

function aoSairDropzone(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('dropzoneLote');
    if (dz) {
        dz.classList.remove('border-emerald-500', 'bg-emerald-50/60');
    }
}

function aoSoltarArquivos(e) {
    e.preventDefault();
    e.stopPropagation();
    aoSairDropzone(e);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        aoSelecionarArquivosLote(e.dataTransfer.files);
    }
}

async function aoSelecionarArquivosLote(files) {
    if (!files || files.length === 0) return;

    const painelRevisao = document.getElementById('painelRevisaoLote');
    const tbody = document.getElementById('listaConciliacaoLoteTabela');
    const btnLimpar = document.getElementById('btnLimparFilaLote');

    if (painelRevisao) painelRevisao.classList.remove('hidden');
    if (btnLimpar) btnLimpar.classList.remove('hidden');

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="py-10 text-center text-slate-400">
                <i class="fa-solid fa-brain fa-spin text-2xl text-emerald-600 mb-2"></i>
                <p class="font-bold text-slate-700">Analisando ${files.length} arquivos e cruzando nomes com os colaboradores...</p>
                <p class="text-[11px] text-slate-400">Normalizando nomes, limpando ruídos e identificando registros ativos.</p>
            </td>
        </tr>
    `;

    try {
        const payloadArquivos = Array.from(files).map(f => ({
            nome: f.name,
            tamanho: f.size
        }));

        const res = await fetch('/api/contracheques/conciliar-nomes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ arquivos: payloadArquivos })
        });

        const data = await res.json();
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-500">Erro ao conciliar arquivos: ${data.error || 'Falha no servidor'}</td></tr>`;
            return;
        }

        colaboradoresLoteCache = data.colaboradores || [];

        // Monta a fila de arquivos mesclando o objeto File real com a resposta do motor
        filaArquivosLote = Array.from(files).map(f => {
            const match = (data.resultados || []).find(r => r.nome_arquivo === f.name) || {};
            return {
                file: f,
                nome: f.name,
                tamanho: f.size,
                colaborador_id: match.colaborador_id || null,
                colaborador_nome: match.colaborador_nome || null,
                cargo: match.cargo || '',
                confianca: match.confianca || 0.0,
                status: match.status || 'NENHUM',
                motivo: match.motivo || 'Pendente de vinculação'
            };
        });

        renderizarTabelaConciliacao();

    } catch (err) {
        console.error('Erro na conciliação de lote:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-500">Falha ao processar conciliação no servidor.</td></tr>`;
    }
}

function renderizarTabelaConciliacao() {
    const tbody = document.getElementById('listaConciliacaoLoteTabela');
    const painelRevisao = document.getElementById('painelRevisaoLote');
    const badgeTotal = document.getElementById('loteTotalSelecionadosBadge');
    const badgeExatos = document.getElementById('loteMatchesExatosBadge');
    const badgeDuvida = document.getElementById('loteMatchesDuvidaBadge');
    const btnConfirmar = document.getElementById('btnConfirmarEnvioLote');
    const btnTexto = document.getElementById('btnConfirmarEnvioLoteTexto');
    const btnLimpar = document.getElementById('btnLimparFilaLote');

    if (!filaArquivosLote || filaArquivosLote.length === 0) {
        if (painelRevisao) painelRevisao.classList.add('hidden');
        if (btnLimpar) btnLimpar.classList.add('hidden');
        if (btnConfirmar) btnConfirmar.disabled = true;
        if (btnTexto) btnTexto.textContent = 'Confirmar e Enviar para os Colaboradores';
        if (tbody) tbody.innerHTML = '';
        return;
    }

    if (painelRevisao) painelRevisao.classList.remove('hidden');
    if (btnLimpar) btnLimpar.classList.remove('hidden');

    const total = filaArquivosLote.length;
    const vinculados = filaArquivosLote.filter(item => item.colaborador_id).length;
    const pendentes = total - vinculados;

    if (badgeTotal) badgeTotal.textContent = `${total} ${total === 1 ? 'arquivo' : 'arquivos'}`;
    if (badgeExatos) {
        badgeExatos.textContent = `${vinculados} de ${total} vinculados`;
        badgeExatos.className = vinculados === total 
            ? 'bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg font-bold'
            : 'bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg font-bold';
    }

    if (badgeDuvida) {
        if (pendentes > 0) {
            badgeDuvida.classList.remove('hidden');
            badgeDuvida.textContent = `${pendentes} pendente(s)`;
        } else {
            badgeDuvida.classList.add('hidden');
        }
    }

    if (btnConfirmar) {
        btnConfirmar.disabled = vinculados === 0 || uploadLoteEmAndamento;
    }
    if (btnTexto) {
        btnTexto.textContent = `Confirmar e Enviar (${vinculados} holerites vinculados)`;
    }

    tbody.innerHTML = filaArquivosLote.map((item, idx) => {
        const isPdf = item.nome.toLowerCase().endsWith('.pdf');
        const iconClass = isPdf ? 'fa-file-pdf text-rose-500' : 'fa-file-image text-blue-500';
        const tamFmt = item.tamanho > 1048576 
            ? `${(item.tamanho / 1048576).toFixed(1)} MB` 
            : `${Math.round(item.tamanho / 1024)} KB`;

        let statusBadgeHtml = '';
        let rowBgClass = '';

        if (item.colaborador_id) {
            if (item.status === 'EXATO') {
                statusBadgeHtml = `
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title="${item.motivo}">
                        <i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i> Identificado (100%)
                    </span>
                `;
            } else if (item.status === 'PROVAVEL') {
                statusBadgeHtml = `
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200" title="${item.motivo}">
                        <i class="fa-solid fa-circle-info mr-1 text-sky-600"></i> Provável (${Math.round((item.confianca || 0.7) * 100)}%)
                    </span>
                `;
            } else {
                statusBadgeHtml = `
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200" title="${item.motivo}">
                        <i class="fa-solid fa-user-pen mr-1 text-indigo-600"></i> Ajustado Manual
                    </span>
                `;
            }
        } else {
            rowBgClass = 'bg-amber-50/40';
            statusBadgeHtml = `
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300" title="${item.motivo}">
                    <i class="fa-solid fa-triangle-exclamation mr-1 text-amber-600"></i> Seleção Obrigatória
                </span>
            `;
        }

        return `
            <tr class="hover:bg-slate-50 transition ${rowBgClass}">
                <td class="py-2.5 px-3 font-mono text-slate-400 font-bold">${idx + 1}</td>
                <td class="py-2.5 px-3">
                    <div class="flex items-center space-x-2 font-medium text-slate-800 max-w-[280px] truncate" title="${item.nome}">
                        <i class="fa-solid ${iconClass} text-sm shrink-0"></i>
                        <span class="truncate">${item.nome}</span>
                    </div>
                </td>
                <td class="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">${tamFmt}</td>
                <td class="py-2.5 px-3">
                    <select onchange="alterarColaboradorLote(${idx}, this.value)"
                        class="w-full max-w-sm px-2.5 py-1.5 text-xs rounded-lg border ${item.colaborador_id ? 'border-slate-300 bg-white' : 'border-amber-400 bg-amber-50/50 font-bold text-amber-900'} focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="">-- Não identificado / Selecionar --</option>
                        ${colaboradoresLoteCache.map(c => `
                            <option value="${c.id}" ${c.id === item.colaborador_id ? 'selected' : ''}>
                                ${c.nome} (${c.cargo || 'Geral'})
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td class="py-2.5 px-3 whitespace-nowrap">
                    ${statusBadgeHtml}
                </td>
                <td class="py-2.5 px-3 text-right">
                    <button type="button" onclick="removerArquivoLote(${idx})" title="Remover este arquivo da lista"
                        class="px-2 py-1 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 rounded text-[11px] font-semibold transition">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function alterarColaboradorLote(idx, novoId) {
    if (!filaArquivosLote[idx]) return;
    const cId = novoId ? parseInt(novoId) : null;
    filaArquivosLote[idx].colaborador_id = cId;

    if (cId) {
        const colab = colaboradoresLoteCache.find(c => c.id === cId);
        filaArquivosLote[idx].colaborador_nome = colab ? colab.nome : '';
        filaArquivosLote[idx].cargo = colab ? colab.cargo : '';
        filaArquivosLote[idx].status = 'MANUAL';
        filaArquivosLote[idx].motivo = 'Vinculado manualmente pelo operador de RH';
    } else {
        filaArquivosLote[idx].colaborador_nome = null;
        filaArquivosLote[idx].cargo = '';
        filaArquivosLote[idx].status = 'NENHUM';
        filaArquivosLote[idx].motivo = 'Pendente de seleção';
    }

    renderizarTabelaConciliacao();
}

function removerArquivoLote(idx) {
    if (!filaArquivosLote[idx]) return;
    filaArquivosLote.splice(idx, 1);
    renderizarTabelaConciliacao();
}

function limparFilaLote() {
    if (uploadLoteEmAndamento) return;
    filaArquivosLote = [];
    const inputArq = document.getElementById('inputArquivosLote');
    if (inputArq) inputArq.value = '';
    renderizarTabelaConciliacao();
}

async function iniciarEnvioLote() {
    if (uploadLoteEmAndamento) return;

    const itensParaEnviar = filaArquivosLote.filter(item => item.colaborador_id);
    if (itensParaEnviar.length === 0) {
        alert('Nenhum arquivo vinculado a colaborador para envio. Vincule pelo menos um arquivo na lista.');
        return;
    }

    const mes = parseInt(document.getElementById('lote_mes').value);
    const ano = parseInt(document.getElementById('lote_ano').value);
    const nomesMeses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º Salário'];
    const competencia = mes === 13 ? `13º Salário / ${ano}` : `${nomesMeses[mes]} / ${ano}`;

    const msgConfirm = `Confirma o envio em lote de ${itensParaEnviar.length} contracheque(s)?\n\n• Competência: ${competencia}\n• Os arquivos serão vinculados aos respectivos cadastros e ficarão imediatamente visíveis para os colaboradores no Portal do Colaborador.`;
    if (!confirm(msgConfirm)) return;

    uploadLoteEmAndamento = true;

    // UI de progresso
    const painelProgresso = document.getElementById('painelProgressoLote');
    const barraProgresso = document.getElementById('barraProgressoLote');
    const textoProgresso = document.getElementById('textoProgressoLote');
    const pctProgresso = document.getElementById('porcentagemProgressoLote');
    const btnConfirmar = document.getElementById('btnConfirmarEnvioLote');
    const btnLimpar = document.getElementById('btnLimparFilaLote');

    if (painelProgresso) painelProgresso.classList.remove('hidden');
    if (btnConfirmar) btnConfirmar.disabled = true;
    if (btnLimpar) btnLimpar.disabled = true;

    let sucessos = 0;
    let falhas = 0;
    const totalItens = itensParaEnviar.length;

    for (let i = 0; i < totalItens; i++) {
        const item = itensParaEnviar[i];
        const percent = Math.round((i / totalItens) * 100);

        if (barraProgresso) barraProgresso.style.width = `${percent}%`;
        if (pctProgresso) pctProgresso.textContent = `${percent}%`;
        if (textoProgresso) {
            textoProgresso.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-blue-600 mr-2"></i> Enviando (${i + 1}/${totalItens}): <strong>${item.nome}</strong> &rarr; <em>${item.colaborador_nome}</em>...`;
        }

        try {
            // Conversão do File para Base64
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(item.file);
            });

            const payload = {
                ano: ano,
                mes: mes,
                competencia: competencia,
                nome_arquivo: item.nome,
                tipo_arquivo: item.file.type || (item.nome.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                arquivo_base64: base64Data,
                valor_liquido: 0.0,
                observacoes: 'Upload em Lote Automatizado'
            };

            const res = await fetch(`/api/funcionarios/${item.colaborador_id}/contracheques`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                sucessos++;
            } else {
                falhas++;
                const errData = await res.json().catch(() => ({}));
                console.error(`Falha no envio de ${item.nome}:`, errData);
            }
        } catch (errEnvio) {
            falhas++;
            console.error(`Erro ao processar arquivo ${item.nome}:`, errEnvio);
        }
    }

    // Conclusão
    if (barraProgresso) barraProgresso.style.width = '100%';
    if (pctProgresso) pctProgresso.textContent = '100%';
    if (textoProgresso) {
        textoProgresso.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-2"></i> Processamento Concluído! <strong>${sucessos}</strong> enviados com sucesso${falhas > 0 ? `, <strong>${falhas}</strong> falha(s)` : ''}.`;
    }

    uploadLoteEmAndamento = false;

    setTimeout(() => {
        alert(`Envio em lote finalizado!\n\n✔ ${sucessos} contracheques anexados com sucesso e publicados no Portal do Colaborador.\n${falhas > 0 ? `✖ ${falhas} arquivo(s) não puderam ser processados.` : ''}`);
        fecharModal('modalUploadLoteContracheques');
        carregarFuncionarios();
        carregarStats();
        verificarStatusSyncOnline();
    }, 600);
}

// =========================================================================
// SINCRONIZAÇÃO COM O SISTEMA ONLINE (GITHUB / NUVEM)
// =========================================================================
let syncOnlineEmAndamento = false;

async function verificarStatusSyncOnline() {
    const badge = document.getElementById('badgeSyncPendente');
    const btn = document.getElementById('btnSyncOnline');
    if (!btn) return;

    try {
        const res = await fetch('/api/sistema/status-sync');
        if (!res.ok) return;
        const data = await res.json();

        if (badge) {
            if (data.has_changes) {
                badge.classList.remove('hidden');
                btn.title = `Há ${data.total_pendentes} alteração(ões) locais pendentes de envio para o sistema online. Clique para atualizar!`;
            } else {
                badge.classList.add('hidden');
                btn.title = 'Sistema online atualizado com o sistema local (GitHub / Nuvem).';
            }
        }

        // Se o modal estiver aberto, atualiza seus dados
        atualizarDadosModalSync(data);
    } catch (err) {
        console.warn('Não foi possível verificar status de sincronização online:', err);
    }
}

function atualizarDadosModalSync(data) {
    const badgeModal = document.getElementById('syncModalBadge');
    const msgModal = document.getElementById('syncModalMensagem');
    const ultimoModal = document.getElementById('syncModalUltimo');
    const listaContainer = document.getElementById('syncModalListaArquivosContainer');
    const lista = document.getElementById('syncModalListaArquivos');

    if (!badgeModal) return;

    if (ultimoModal && data.ultimo_sync) {
        ultimoModal.textContent = data.ultimo_sync;
    }

    if (data.has_changes) {
        badgeModal.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 font-mono';
        badgeModal.textContent = `${data.total_pendentes} pendente(s)`;
        if (msgModal) {
            msgModal.innerHTML = `Existem <strong>${data.total_pendentes}</strong> arquivos/dados modificados localmente que ainda não foram enviados para o sistema online.`;
        }
        if (listaContainer && lista) {
            listaContainer.classList.remove('hidden');
            lista.innerHTML = (data.arquivos_pendentes || []).map(a => `<div>• ${a}</div>`).join('');
        }
    } else {
        badgeModal.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono';
        badgeModal.textContent = 'Sincronizado';
        if (msgModal) {
            msgModal.textContent = 'O sistema online já está totalmente em dia com os seus dados locais. Nenhuma alteração pendente.';
        }
        if (listaContainer) {
            listaContainer.classList.add('hidden');
        }
    }
}

function abrirModalSyncOnline() {
    abrirModal('modalSyncOnline');
    verificarStatusSyncOnline();
}

async function sincronizarSistemaOnline() {
    // Disparo direto de 1 clique para atualizar o sistema online
    await executarSincronizacaoOnline();
}

async function executarSincronizacaoOnline() {
    if (syncOnlineEmAndamento) return;
    syncOnlineEmAndamento = true;

    const btnTop = document.getElementById('btnSyncOnline');
    const iconTop = document.getElementById('iconSyncOnline');
    const textoTop = document.getElementById('textoSyncOnline');

    const btnModal = document.getElementById('btnExecutarSyncModal');
    const iconModal = document.getElementById('iconExecutarSync');
    const textoModal = document.getElementById('textoExecutarSync');

    // Estado visual de carregamento no botão
    if (btnTop) btnTop.disabled = true;
    if (iconTop) iconTop.className = 'fa-solid fa-spinner fa-spin mr-1.5 text-sky-200';
    if (textoTop) textoTop.textContent = 'Atualizando Online...';

    if (btnModal) btnModal.disabled = true;
    if (iconModal) iconModal.className = 'fa-solid fa-spinner fa-spin mr-2';
    if (textoModal) textoModal.textContent = 'Sincronizando com GitHub...';

    try {
        const res = await fetch('/api/sistema/sincronizar-online', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        if (res.ok && data.success) {
            if (data.status === 'sincronizado') {
                alert(`🚀 SISTEMA ONLINE ATUALIZADO COM SUCESSO!\n\n✔ ${data.total_arquivos} arquivo(s) foram enviados para o GitHub.\n✔ Repositório: ${data.repo_url}\n✔ Horário: ${data.timestamp}\n\nTodas as novidades, holerites e cadastros locais já estão disponíveis online!`);
            } else {
                alert(`✅ O sistema online já está 100% atualizado!\n\nNenhuma nova alteração pendente foi encontrada no sistema local.`);
            }
            fecharModal('modalSyncOnline');
        } else {
            alert(`❌ Falha ao atualizar sistema online:\n\n${data.error || 'Erro desconhecido na sincronização.'}`);
        }
    } catch (err) {
        console.error('Erro na sincronização:', err);
        alert('❌ Não foi possível conectar ao servidor para sincronização online. Verifique sua conexão com a internet.');
    } finally {
        syncOnlineEmAndamento = false;
        if (btnTop) btnTop.disabled = false;
        if (iconTop) iconTop.className = 'fa-solid fa-cloud-arrow-up mr-1.5 text-sky-200 group-hover:scale-110 transition';
        if (textoTop) textoTop.textContent = 'Atualizar Online';

        if (btnModal) btnModal.disabled = false;
        if (iconModal) iconModal.className = 'fa-solid fa-cloud-arrow-up mr-2';
        if (textoModal) textoModal.textContent = 'Sincronizar Agora';

        await verificarStatusSyncOnline();
    }
}

