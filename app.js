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
  return { session, profile };
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// ---------- CSV de leads ----------
// Espera colunas: CPF, NOME, PMT, TELEFONE (telefones separados por ;)
// Formato igual ao que a MM Crédito já usa nas bases da prefeitura.
function parseLeadsCSV(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = linhas[0].split(",").map((h) => h.trim().toUpperCase());
  const idxCpf = header.indexOf("CPF");
  const idxNome = header.indexOf("NOME");
  const idxPmt = header.indexOf("PMT");
  const idxTel = header.indexOf("TELEFONE");

  const leads = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = parseCsvLine(linhas[i]);
    const cpf = (campos[idxCpf] || "").trim();
    let nome = (campos[idxNome] || "").trim();
    if (nome === "NULL") nome = "";
    const pmtRaw = (campos[idxPmt] || "").trim();
    const pmt = pmtRaw && pmtRaw !== "NULL"
      ? parseFloat(pmtRaw.replace(/\./g, "").replace(",", "."))
      : null;
    const telRaw = (campos[idxTel] || "").trim();
    const telefones = telRaw && telRaw !== "NULL"
      ? telRaw.split(";").map((t) => t.trim()).filter(Boolean)
      : [];
    if (cpf) leads.push({ cpf, nome, pmt, telefones, status: "novo" });
  }
  return leads;
}

// parser simples de linha CSV respeitando aspas
function parseCsvLine(linha) {
  const out = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentroAspas = !dentroAspas;
    } else if (c === "," && !dentroAspas) {
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
