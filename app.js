// =========================================================
// Helpers compartilhados entre login.html, admin.html e consultor.html
// =========================================================

// Garante que existe uma sessão ativa; senão manda pro login.
// Retorna { session, profile } quando tudo certo.
async function exigirLogin(roleExigida) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !profile || !profile.ativo) {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
    return null;
  }
  if (roleExigida && profile.role !== roleExigida) {
    // manda pra página certa do papel dele
    window.location.href = profile.role === "admin" ? "admin.html" : "consultor.html";
    return null;
  }
  registrarAcessoSessao(profile);
  return { session, profile };
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// ---------- CSV de leads ----------
// Espera colunas: CPF, NOME, PMT, TELEFONE (telefones separados por ;)
// Formato igual ao que a MM Crédito já usa nas bases da prefeitura.
function normalizarCabecalho(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function parseDataNascimento(v) {
  const t = String(v || "").trim();
  if (!t || t === "NULL") return null;
  let d, m, a;
  let mt = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (mt) { d = +mt[1]; m = +mt[2]; a = +mt[3]; }
  else if ((mt = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else return null;
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d || a < 1900 || dt > new Date()) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Colunas obrigatórias: CPF, NOME, PMT, TELEFONE. Opcionais: CONVENIO, DATA_NASCIMENTO.
// Detecta sozinho o separador (vírgula, ponto e vírgula, tab ou |) e aceita variações comuns de nome de coluna.
function parseLeadsCSV(texto) {
  const linhas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) throw new Error("O arquivo está vazio.");
  const delim = [",", ";", "\t", "|"]
    .map((d) => ({ d, n: parseCsvLine(linhas[0], d).length }))
    .sort((a, b) => b.n - a.n)[0].d;
  const header = parseCsvLine(linhas[0], delim).map((h) => normalizarCabecalho(h));
  const achar = (...nomes) => header.findIndex((h) => nomes.includes(h));
  const idxCpf = achar("CPF", "CPF CNPJ", "CPFCNPJ", "DOCUMENTO");
  const idxNome = achar("NOME", "NOME CLIENTE", "NOME DO CLIENTE", "CLIENTE");
  const idxPmt = achar("PMT", "PARCELA", "VALOR PARCELA");
  // aceita uma coluna de telefones (separados por ; ou /) ou várias colunas: TELEFONE 1, TELEFONE 2, ...
  const idxsTel = header.map((h, i) => (/^(TELEFONES?|FONES?|CELULAR|TEL)( \d+)?$/.test(h) ? i : -1)).filter((i) => i >= 0);
  const idxTel = idxsTel.length ? idxsTel[0] : -1;
  const idxConv = achar("CONVENIO");
  const idxNasc = achar("DATA NASCIMENTO", "NASCIMENTO", "DATA DE NASCIMENTO", "DT NASCIMENTO");

  const faltando = [["CPF", idxCpf], ["NOME", idxNome], ["PMT", idxPmt], ["TELEFONE", idxTel]].filter(([, i]) => i < 0).map(([n]) => n);
  if (faltando.length > 0) {
    throw new Error(`Não encontrei a(s) coluna(s) ${faltando.join(", ")}. Colunas lidas no arquivo: ${header.join(" | ") || "(nenhuma)"}.`);
  }

  const leads = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = parseCsvLine(linhas[i], delim);
    const cpf = (campos[idxCpf] || "").trim();
    let nome = (campos[idxNome] || "").trim();
    if (nome === "NULL") nome = "";
    const pmtRaw = (campos[idxPmt] || "").trim();
    const pmt = pmtRaw && pmtRaw !== "NULL"
      ? parseFloat(pmtRaw.replace(/\./g, "").replace(",", "."))
      : null;
    const telefones = [];
    for (const it of idxsTel) {
      const telRaw = (campos[it] || "").trim();
      if (!telRaw || telRaw === "NULL") continue;
      for (const t of telRaw.split(/[;\/]/)) {
        const tel = t.trim();
        if (tel && !telefones.includes(tel)) telefones.push(tel);
      }
    }
    if (!cpf) continue;
    const lead = { cpf, nome, pmt: Number.isNaN(pmt) ? null : pmt, telefones, status: "novo" };
    if (idxConv >= 0) {
      const conv = (campos[idxConv] || "").trim();
      lead.convenio = conv && conv !== "NULL" ? conv : null;
    }
    if (idxNasc >= 0) lead.data_nascimento = parseDataNascimento(campos[idxNasc]);
    leads.push(lead);
  }
  return leads;
}

// parser simples de linha CSV respeitando aspas
function parseCsvLine(linha, delim = ",") {
  const out = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentroAspas = !dentroAspas;
    } else if (c === delim && !dentroAspas) {
      out.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  out.push(atual);
  return out;
}

// ---------- formatação ----------
function formatBRL(v) {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const RESULTADO_LABEL = {
  nao_atende: "Não atende",
  sem_interesse: "Sem interesse",
  recusou: "Recusou",
  vai_pensar: "Vai pensar",
  reagendar: "Reagendar",
  numero_errado: "Número errado",
  vendeu: "Vendeu",
};

const STATUS_LABEL = {
  novo: "Novo",
  em_andamento: "Em andamento",
  tabulado: "Tabulado",
};

const PRODUTO_LABEL = {
  cartao_credito: "Cartão de Crédito",
  cartao_beneficio: "Cartão Benefício",
  emprestimo: "Empréstimo",
};

const TABELAS_POR_CONVENIO = {
  SPPREV: ["TOP Comercial", "Flex 1 Comercial", "Flex 2 Comercial", "Flex 3 Comercial", "Flex 4 Comercial", "Acerto"],
  IPREM: ["TOP Comercial", "Flex 1 Comercial", "Flex 2 Comercial", "Flex 3 Comercial", "Flex 4 Comercial", "Flex 5 Comercial", "Acerto", "Empréstimo"],
  "Gov PR": ["TOP Comercial", "Flex 1 Comercial", "Flex 2 Comercial", "Flex 3 Comercial", "Flex 4 Comercial", "Acerto"],
  Siape: ["TOP Comercial", "Flex 1 Comercial", "Flex 2 Comercial", "Flex 3 Comercial", "Flex 4 Comercial", "Flex 5 Comercial", "Flex 6 Comercial"],
  "SEPLAG/MG": ["TOP Comercial", "Flex 1 Comercial", "Flex 2 Comercial", "Flex 3 Comercial", "Flex 4 Comercial"],
  PMMG: ["TOP Comercial", "Flex 1 Comercial", "Flex 2 Comercial", "Flex 3 Comercial", "Flex 4 Comercial"],
};

const PRAZOS_MESES = [96];

// Mascara CPF pra exibição em listas (mantém completo só onde é operacionalmente necessário:
// tela do cliente e exportações do admin).
function maskCPF(cpf) {
  if (!cpf) return "-";
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.XXX.XXX-${digitos.slice(9, 11)}`;
}

// Contrato conta para a produção só se NÃO estiver cancelado (situação ou esteira).
function contratoConta(c) {
  const txt = `${c.situacao || ""} ${c.esteira || ""}`.toLowerCase();
  return !/cancel/.test(txt);
}


// ---------- Registro de acesso (uma vez por aba/sessão) ----------
function registrarAcessoSessao(profile) {
  try {
    if (sessionStorage.getItem("mm_acesso_registrado") === "1") return;
    sessionStorage.setItem("mm_acesso_registrado", "1");
  } catch (e) {}
  supabaseClient.rpc("registrar_acesso", { p_evento: "login", p_detalhe: { papel: profile.role, pagina: location.pathname.split("/").pop() } }).then(() => {}, () => {});
}
function registrarEvento(evento, detalhe) {
  return supabaseClient.rpc("registrar_acesso", { p_evento: evento, p_detalhe: detalhe || {} }).then(() => {}, () => {});
}

// ---------- Quem está online (presença em tempo real) ----------
let CANAL_PRESENCA = null;
function entrarPresenca(profile, aoMudar) {
  try {
    CANAL_PRESENCA = supabaseClient.channel("mm-online", { config: { presence: { key: profile.id } } });
    if (aoMudar) CANAL_PRESENCA.on("presence", { event: "sync" }, () => aoMudar(CANAL_PRESENCA.presenceState()));
    CANAL_PRESENCA.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && profile.role === "consultor") {
        await CANAL_PRESENCA.track({ nome: profile.nome, desde: new Date().toISOString(), pagina: location.pathname.split("/").pop() });
      }
    });
  } catch (e) { console.warn("presença indisponível", e); }
}

// ---------- Lembretes de retorno (aviso na tela) ----------
function iniciarLembretes(profile) {
  const JANELA_MIN = 10;
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.15;
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
    } catch (e) {}
  }
  function jaAvisado(chave) { try { return (JSON.parse(localStorage.getItem("mm_lembretes") || "[]")).includes(chave); } catch (e) { return false; } }
  function marcar(chave) { try { const l = JSON.parse(localStorage.getItem("mm_lembretes") || "[]"); l.push(chave); localStorage.setItem("mm_lembretes", JSON.stringify(l.slice(-200))); } catch (e) {} }
  function mostrar(lead, quando, atrasado) {
    let box = document.getElementById("mmLembretes");
    if (!box) {
      box = document.createElement("div");
      box.id = "mmLembretes";
      box.style.cssText = "position:fixed; top:14px; right:14px; z-index:100; display:flex; flex-direction:column; gap:10px; max-width:340px;";
      document.body.appendChild(box);
    }
    const hora = quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const card = document.createElement("div");
    card.style.cssText = "background:#161F42; border:2px solid #D4AF37; border-radius:12px; padding:14px; color:#F3F1EA; box-shadow:0 8px 24px rgba(0,0,0,.5); font-size:14px;";
    card.innerHTML = `<div style="color:#D4AF37; font-weight:700; margin-bottom:4px;">⏰ ${atrasado ? "Retorno atrasado" : "Retorno chegando"} — ${hora}</div>
      <div style="margin-bottom:10px;">${lead.nome || "(sem nome)"}</div>
      <a href="cliente.html?id=${lead.id}" style="background:#D4AF37; color:#0B1026; text-decoration:none; padding:6px 12px; border-radius:8px; font-weight:700; margin-right:8px;">Abrir cliente</a>
      <button type="button" style="background:none; border:1px solid #AEB6D3; color:#AEB6D3; padding:5px 10px; border-radius:8px; cursor:pointer;">Dispensar</button>`;
    card.querySelector("button").onclick = () => card.remove();
    box.appendChild(card);
    beep();
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Retorno de cliente", { body: `${lead.nome || "Cliente"} — ${hora}` }); } catch (e) {}
  }
  async function verificar() {
    const { data } = await supabaseClient.from("leads").select("id, nome, tabulacoes(resultado, criado_em, reagendado_para)")
      .eq("atribuido_a", profile.id).eq("status", "em_andamento");
    const agora = Date.now();
    (data || []).forEach((l) => {
      const tabs = (l.tabulacoes || []).slice().sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      const ult = tabs[0];
      if (!ult || ult.resultado !== "reagendar" || !ult.reagendado_para) return;
      const quando = new Date(ult.reagendado_para);
      const diffMin = (quando - agora) / 60000;
      const chave = `${l.id}|${ult.reagendado_para}`;
      const hoje = new Date().toDateString() === quando.toDateString();
      if (jaAvisado(chave)) return;
      if (diffMin <= JANELA_MIN && (diffMin > -720 || hoje)) { marcar(chave); mostrar(l, quando, diffMin < 0); }
    });
  }
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
  verificar();
  setInterval(verificar, 60000);
}
