// =========================================================================
// SGP SANTOS MANUTENÇÃO - PORTAL DO COLABORADOR (FRONTEND)
// =========================================================================
const TOKEN_KEY = 'sgp_portal_token';
const USER_KEY = 'sgp_portal_user';

let colaboradorLogado = null;
let todosContracheques = [];
let anoFiltroAtual = 'Todos';
let modoVisualizacaoAtual = localStorage.getItem('sgp_portal_view_mode') || 'lista';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    configurarMascaraLogin();
    verificarSessao();
});

// =========================================================================
// SESSÃO & AUTENTICAÇÃO
// =========================================================================
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function verificarSessao() {
    const token = getToken();
    if (token) {
        carregarPortal();
    } else {
        mostrarTelaLogin();
    }
}

function mostrarTelaLogin() {
    document.getElementById('viewLogin').classList.remove('hidden');
    document.getElementById('viewApp').classList.add('hidden');
    document.getElementById('formLogin').reset();
    document.getElementById('loginErro').classList.add('hidden');
}

function mostrarTelaApp() {
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('viewApp').classList.remove('hidden');
}

function configurarMascaraLogin() {
    const input = document.getElementById('loginIdentificador');
    if (!input) return;

    input.addEventListener('input', (e) => {
        let val = e.target.value;
        const apenasNumeros = val.replace(/\D/g, '');

        // Se o usuário estiver digitando números e parecer com CPF (até 11 dígitos)
        if (apenasNumeros.length > 0 && /^\d+$/.test(val.replace(/[.-]/g, ''))) {
            if (apenasNumeros.length <= 11) {
                if (apenasNumeros.length > 9) {
                    val = apenasNumeros.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                } else if (apenasNumeros.length > 6) {
                    val = apenasNumeros.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                } else if (apenasNumeros.length > 3) {
                    val = apenasNumeros.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                } else {
                    val = apenasNumeros;
                }
                e.target.value = val;
            }
        }
    });
}

function toggleVisibilidadeSenha(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

async function realizarLogin(e) {
    e.preventDefault();
    const login = document.getElementById('loginIdentificador').value.trim();
    const senha = document.getElementById('loginSenha').value.trim();
    const erroDiv = document.getElementById('loginErro');
    const erroTexto = document.getElementById('loginErroTexto');
    const btnSubmit = document.getElementById('btnLoginSubmit');

    erroDiv.classList.add('hidden');
    btnSubmit.disabled = true;
    const btnHtmlOriginal = btnSubmit.innerHTML;
    btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Autenticando...`;

    try {
        const res = await fetch('/api/portal/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, senha })
        });

        const data = await res.json();
        if (res.ok && data.token) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(USER_KEY, JSON.stringify(data.funcionario));
            await carregarPortal();
        } else {
            erroTexto.textContent = data.error || 'Credenciais inválidas. Verifique seu CPF/matrícula e senha.';
            erroDiv.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Erro no login:', err);
        erroTexto.textContent = 'Falha de conexão com o servidor. Verifique sua conexão e tente novamente.';
        erroDiv.classList.remove('hidden');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = btnHtmlOriginal;
    }
}

function realizarLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    colaboradorLogado = null;
    todosContracheques = [];
    mostrarTelaLogin();
}

// =========================================================================
// CARREGAMENTO DO PORTAL DO COLABORADOR
// =========================================================================
async function carregarPortal() {
    const token = getToken();
    if (!token) return mostrarTelaLogin();

    try {
        // Carrega dados cadastrais
        const resDados = await fetch('/api/portal/meus-dados', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resDados.status === 401) {
            realizarLogout();
            return;
        }

        colaboradorLogado = await resDados.json();
        atualizarCabecalhoUsuario(colaboradorLogado);

        mostrarTelaApp();

        // Carrega contracheques
        await carregarMeusContracheques();
    } catch (err) {
        console.error('Erro ao carregar dados do portal:', err);
        mostrarTelaLogin();
    }
}

function atualizarCabecalhoUsuario(f) {
    document.getElementById('appUserNome').textContent = f.nome || 'Colaborador';
    document.getElementById('appUserCargo').textContent = f.cargo || '---';
    document.getElementById('appUserMatricula').textContent = f.matricula || '---';
    document.getElementById('appUserLocal').textContent = f.local_trabalho || 'CDA';

    // Iniciais e Foto do Avatar
    const nomeSeguro = f.nome || 'FC';
    const iniciais = (nomeSeguro.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2) || 'FC').toUpperCase();
    const avatarEl = document.getElementById('appUserAvatar');
    if (f.foto_path && f.foto_path.trim()) {
        const fotoUrl = '/' + f.foto_path.trim().replace(/\\/g, '/').replace(/^\//, '');
        avatarEl.innerHTML = `<img src="${fotoUrl}" alt="${nomeSeguro}" class="w-full h-full rounded-2xl object-cover" onerror="this.onerror=null; this.parentNode.textContent='${iniciais}';">`;
    } else {
        avatarEl.textContent = iniciais;
    }

    // Admissão & Tempo de Empresa
    if (f.admissao) {
        document.getElementById('appStatAdmissao').textContent = formatarData(f.admissao);
        document.getElementById('appStatTempoEmpresa').textContent = `${calcularTempoEmpresa(f.admissao)} de Santos Manutenção`;
    } else {
        document.getElementById('appStatAdmissao').textContent = '---';
        document.getElementById('appStatTempoEmpresa').textContent = 'Recente';
    }
}

async function carregarMeusContracheques() {
    const token = getToken();
    const grid = document.getElementById('appGridContracheques');

    grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
            <i class="fa-solid fa-circle-notch fa-spin text-2xl text-blue-600 mb-2"></i>
            <p>Buscando seus contracheques...</p>
        </div>
    `;

    try {
        const res = await fetch('/api/portal/meus-contracheques', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            realizarLogout();
            return;
        }

        todosContracheques = await res.json();
        document.getElementById('appStatTotalHolerites').textContent = todosContracheques.length;

        // Atualiza botões de filtro de ano e alternador de visualização
        atualizarFiltrosAnos(todosContracheques);
        atualizarBotoesAlternador();

        renderizarContracheques(anoFiltroAtual);
    } catch (err) {
        console.error('Erro ao carregar contracheques:', err);
        grid.innerHTML = `
            <div class="col-span-full py-8 text-center text-rose-500">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p>Falha ao carregar contracheques do servidor.</p>
            </div>
        `;
    }
}

function atualizarFiltrosAnos(lista) {
    const container = document.getElementById('appFiltroAnos');
    const anosSet = new Set(lista.map(c => String(c.ano)));
    anosSet.add('2026'); // ano atual garantido

    const anosOrdenados = Array.from(anosSet).sort().reverse();

    let html = `<button onclick="filtrarContrachequesPorAno('Todos')" class="filtro-ano-btn px-3 py-1 rounded-lg text-xs ${anoFiltroAtual === 'Todos' ? 'font-bold bg-slate-900 text-white' : 'font-medium text-slate-600 hover:bg-slate-100'} transition" data-ano="Todos">Todos</button>`;
    
    anosOrdenados.forEach(ano => {
        const ativo = anoFiltroAtual === ano;
        html += `<button onclick="filtrarContrachequesPorAno('${ano}')" class="filtro-ano-btn px-3 py-1 rounded-lg text-xs ${ativo ? 'font-bold bg-slate-900 text-white' : 'font-medium text-slate-600 hover:bg-slate-100'} transition" data-ano="${ano}">${ano}</button>`;
    });

    container.innerHTML = html;
}

function alternarModoVisualizacao(modo) {
    if (modo !== 'lista' && modo !== 'grade') modo = 'lista';
    modoVisualizacaoAtual = modo;
    localStorage.setItem('sgp_portal_view_mode', modo);
    atualizarBotoesAlternador();
    renderizarContracheques(anoFiltroAtual);
}

function atualizarBotoesAlternador() {
    const btnLista = document.getElementById('btnModoLista');
    const btnGrade = document.getElementById('btnModoGrade');
    if (!btnLista || !btnGrade) return;

    if (modoVisualizacaoAtual === 'lista') {
        btnLista.className = 'px-2.5 py-1 rounded-lg font-bold bg-white text-blue-700 shadow-xs border border-slate-200/60 flex items-center gap-1.5 transition';
        btnGrade.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition';
    } else {
        btnLista.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition';
        btnGrade.className = 'px-2.5 py-1 rounded-lg font-bold bg-white text-blue-700 shadow-xs border border-slate-200/60 flex items-center gap-1.5 transition';
    }
}

function filtrarContrachequesPorAno(ano) {
    anoFiltroAtual = ano;
    document.querySelectorAll('.filtro-ano-btn').forEach(btn => {
        if (btn.dataset.ano === ano) {
            btn.className = 'filtro-ano-btn px-3 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white transition';
        } else {
            btn.className = 'filtro-ano-btn px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition';
        }
    });
    renderizarContracheques(ano);
}

function renderizarGradeContracheques(ano) {
    renderizarContracheques(ano);
}

function renderizarContracheques(ano) {
    const container = document.getElementById('appGridContracheques');
    if (!container) return;
    const token = getToken();

    let filtrados = todosContracheques;
    if (ano !== 'Todos') {
        filtrados = todosContracheques.filter(c => String(c.ano) === String(ano));
    }

    if (!filtrados || filtrados.length === 0) {
        container.innerHTML = `
            <div class="w-full py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <i class="fa-solid fa-folder-open text-3xl text-slate-300 mb-2"></i>
                <p class="font-bold text-slate-600">Nenhum contracheque disponível ${ano !== 'Todos' ? 'para o ano de ' + ano : 'no momento'}.</p>
                <p class="text-xs text-slate-400 mt-1">Assim que o RH disponibilizar seus holerites, eles aparecerão automaticamente aqui.</p>
            </div>
        `;
        return;
    }

    if (modoVisualizacaoAtual === 'grade') {
        container.innerHTML = renderizarContrachequesGrade(filtrados, token);
    } else {
        container.innerHTML = renderizarContrachequesLista(filtrados, token);
    }
}

function renderizarContrachequesLista(filtrados, token) {
    return `
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                        <th class="py-3 px-3 sm:px-4">Competência</th>
                        <th class="py-3 px-2 sm:px-3 text-left">Ações</th>
                        <th class="py-3 px-3 sm:px-4">Valor Líquido</th>
                        <th class="py-3 px-4 hidden md:table-cell">Documento</th>
                        <th class="py-3 px-4 hidden lg:table-cell">Disponibilizado</th>
                        <th class="py-3 px-4 hidden xl:table-cell">Tamanho</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${filtrados.map(c => {
                        const isPdf = c.nome_arquivo.toLowerCase().endsWith('.pdf');
                        const iconHeader = isPdf ? 'fa-file-pdf text-rose-500' : 'fa-file-image text-blue-500';
                        const tamFmt = c.tamanho_bytes ? (c.tamanho_bytes > 1048576 ? `${(c.tamanho_bytes / 1048576).toFixed(1)} MB` : `${Math.round(c.tamanho_bytes / 1024)} KB`) : '---';
                        const valLiqHtml = c.valor_liquido ? `<span class="font-mono font-bold text-emerald-700">${formatarMoeda(c.valor_liquido)}</span>` : '<span class="text-slate-400 font-normal">---</span>';
                        const dtEnvio = c.created_at ? formatarData(c.created_at.split(' ')[0]) : '---';
                        const downloadUrl = `/api/portal/contracheques/${c.id}/arquivo?token=${encodeURIComponent(token)}`;

                        return `
                            <tr class="hover:bg-blue-50/40 transition">
                                <td class="py-3 px-3 sm:px-4 whitespace-nowrap">
                                    <div class="flex items-center space-x-2">
                                        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs sm:text-sm shrink-0">
                                            <i class="fa-solid ${iconHeader}"></i>
                                        </div>
                                        <span class="inline-block px-2 sm:px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                                            ${c.competencia}
                                        </span>
                                    </div>
                                </td>
                                <td class="py-3 px-2 sm:px-3 whitespace-nowrap">
                                    <div class="inline-flex items-center gap-1.5">
                                        <button onclick="visualizarHolerite(${c.id}, '${c.nome_arquivo.replace(/'/g, "\\'")}')" title="Visualizar Holerite" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-bold text-xs rounded-lg flex items-center transition shadow-2xs">
                                            <i class="fa-solid fa-eye mr-1"></i> Visualizar
                                        </button>
                                        <a href="${downloadUrl}" download="${c.nome_arquivo}" title="Baixar PDF" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center transition shadow-2xs">
                                            <i class="fa-solid fa-download mr-1"></i> Baixar
                                        </a>
                                    </div>
                                </td>
                                <td class="py-3 px-3 sm:px-4 whitespace-nowrap">
                                    ${valLiqHtml}
                                </td>
                                <td class="py-3 px-4 hidden md:table-cell">
                                    <div class="font-bold text-slate-800 text-xs truncate max-w-[200px] sm:max-w-xs" title="${c.nome_arquivo}">
                                        ${c.nome_arquivo}
                                    </div>
                                    ${c.observacoes ? `<div class="text-[10px] text-slate-400 italic">${c.observacoes}</div>` : ''}
                                </td>
                                <td class="py-3 px-4 text-slate-500 whitespace-nowrap hidden lg:table-cell">
                                    <i class="fa-regular fa-calendar-check text-slate-400 mr-1"></i>${dtEnvio}
                                </td>
                                <td class="py-3 px-4 text-slate-500 font-mono whitespace-nowrap hidden xl:table-cell">
                                    ${tamFmt}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}


function renderizarContrachequesGrade(filtrados, token) {
    return `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${filtrados.map(c => {
                const isPdf = c.nome_arquivo.toLowerCase().endsWith('.pdf');
                const iconHeader = isPdf ? 'fa-file-pdf text-rose-500' : 'fa-file-image text-blue-500';
                const tamFmt = c.tamanho_bytes ? (c.tamanho_bytes > 1048576 ? `${(c.tamanho_bytes / 1048576).toFixed(1)} MB` : `${Math.round(c.tamanho_bytes / 1024)} KB`) : '---';
                const valLiqHtml = c.valor_liquido ? `<div class="text-xs font-mono font-bold text-emerald-700 mt-1"><span class="text-[10px] text-slate-500 font-normal">Líquido:</span> ${formatarMoeda(c.valor_liquido)}</div>` : '';
                const dtEnvio = c.created_at ? formatarData(c.created_at.split(' ')[0]) : '';
                const downloadUrl = `/api/portal/contracheques/${c.id}/arquivo?token=${encodeURIComponent(token)}`;

                return `
                    <div class="bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition p-4 flex flex-col justify-between space-y-3">
                        <div class="flex items-start justify-between">
                            <div class="flex items-center space-x-2.5">
                                <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">
                                    <i class="fa-solid ${iconHeader}"></i>
                                </div>
                                <div>
                                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200">
                                        ${c.competencia}
                                    </span>
                                    <h4 class="text-xs font-bold text-slate-800 truncate max-w-[160px] mt-0.5" title="${c.nome_arquivo}">${c.nome_arquivo}</h4>
                                </div>
                            </div>
                        </div>

                        <div class="bg-slate-50 rounded-lg p-2.5 text-[11px] text-slate-600 space-y-0.5 border border-slate-100">
                            <div class="flex justify-between items-center">
                                <span class="text-slate-400">Tamanho:</span>
                                <span class="font-mono text-slate-700 font-semibold">${tamFmt}</span>
                            </div>
                            ${dtEnvio ? `
                            <div class="flex justify-between items-center">
                                <span class="text-slate-400">Disponibilizado:</span>
                                <span>${dtEnvio}</span>
                            </div>` : ''}
                            ${valLiqHtml}
                            ${c.observacoes ? `<p class="text-[10px] text-slate-500 italic pt-1 border-t border-slate-200 mt-1">${c.observacoes}</p>` : ''}
                        </div>

                        <div class="grid grid-cols-2 gap-2 pt-1">
                            <button onclick="visualizarHolerite(${c.id}, '${c.nome_arquivo.replace(/'/g, "\\'")}')" class="w-full py-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-bold text-xs rounded-lg flex items-center justify-center transition shadow-2xs">
                                <i class="fa-solid fa-eye mr-1.5"></i> Visualizar
                            </button>
                            <a href="${downloadUrl}" download="${c.nome_arquivo}" class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center justify-center transition shadow-2xs">
                                <i class="fa-solid fa-download mr-1.5"></i> Baixar PDF
                            </a>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// =========================================================================
// VISUALIZADOR DE DOCUMENTOS (MODAL INTEGRADO)
// =========================================================================
function visualizarHolerite(ccId, nomeArquivo) {
    const token = getToken();
    const url = `/api/portal/contracheques/${ccId}/arquivo?token=${encodeURIComponent(token)}&inline=1`;
    const isPdf = nomeArquivo.toLowerCase().endsWith('.pdf');

    document.getElementById('viewerTituloArquivo').textContent = nomeArquivo;
    document.getElementById('viewerBtnDownload').href = `/api/portal/contracheques/${ccId}/arquivo?token=${encodeURIComponent(token)}`;
    document.getElementById('viewerBtnDownload').setAttribute('download', nomeArquivo);

    const container = document.getElementById('viewerContainer');
    if (isPdf) {
        container.innerHTML = `<iframe src="${url}" class="w-full h-full rounded-xl border border-slate-300 bg-white" title="${nomeArquivo}"></iframe>`;
    } else {
        container.innerHTML = `<div class="overflow-auto max-h-full max-w-full flex items-center justify-center p-2"><img src="${url}" class="max-h-[85vh] max-w-full object-contain rounded-lg shadow-lg border border-slate-300" alt="${nomeArquivo}"></div>`;
    }

    document.getElementById('modalVisualizador').classList.remove('hidden');
}

function fecharModalVisualizador() {
    document.getElementById('modalVisualizador').classList.add('hidden');
    document.getElementById('viewerContainer').innerHTML = '';
}

// =========================================================================
// TROCA DE SENHA DO COLABORADOR
// =========================================================================
function abrirModalTrocarSenha() {
    document.getElementById('inputSenhaAtual').value = '';
    document.getElementById('inputNovaSenha').value = '';
    document.getElementById('inputConfirmaNovaSenha').value = '';
    document.getElementById('trocarSenhaErro').classList.add('hidden');
    document.getElementById('modalTrocarSenha').classList.remove('hidden');
}

function fecharModalTrocarSenha() {
    document.getElementById('modalTrocarSenha').classList.add('hidden');
}

async function submeterTrocaSenha(e) {
    e.preventDefault();
    const token = getToken();
    const senhaAtual = document.getElementById('inputSenhaAtual').value.trim();
    const novaSenha = document.getElementById('inputNovaSenha').value.trim();
    const confirma = document.getElementById('inputConfirmaNovaSenha').value.trim();
    const erroBox = document.getElementById('trocarSenhaErro');

    erroBox.classList.add('hidden');

    if (novaSenha !== confirma) {
        erroBox.textContent = 'A nova senha e a confirmação não conferem.';
        erroBox.classList.remove('hidden');
        return;
    }

    if (novaSenha.length < 4) {
        erroBox.textContent = 'A nova senha deve ter pelo menos 4 caracteres.';
        erroBox.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('btnSalvarSenha');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const res = await fetch('/api/portal/alterar-senha', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                senha_atual: senhaAtual,
                nova_senha: novaSenha
            })
        });

        const data = await res.json();
        if (res.ok) {
            alert('Sua senha foi alterada com sucesso! Guarde-a com segurança.');
            fecharModalTrocarSenha();
        } else {
            erroBox.textContent = data.error || 'Erro ao alterar senha.';
            erroBox.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Erro na troca de senha:', err);
        erroBox.textContent = 'Falha de comunicação com o servidor.';
        erroBox.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Atualizar Senha';
    }
}

// =========================================================================
// FUNÇÕES UTILITÁRIAS
// =========================================================================
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
