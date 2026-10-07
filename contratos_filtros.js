/* =========================================================
   Filtros da tela de Contratos — espelham a tela "Contratos" do CredBase
   (situação, banco, tipo, convênio, tabela, esteira, datas, ordenação)
   Uso:
     const f = ContratosFiltros.montar(elementoDoPainel, { prefixo: "adm", admin: true, aoMudar: () => ... });
     f.atualizarOpcoes(listaDeContratos);          // preenche banco/tipo/convênio/tabela/esteiras
     const lista = f.filtrar(listaDeContratos);    // aplica filtros + ordenação
     const pg = ContratosFiltros.paginar(lista, pagina);
   ========================================================= */
(function () {
  const ESTEIRAS = [
    "01.SUPERVISAO", "02.DIGITACAO", "03.PENDENCIA", "04.BOLETO PEN", "05.AUDITORIA", "06.AGUARDANDO ANALISE",
    "07.NOTA PROMISSORIA PENDENTE", "08.ASSINATURA", "09.POS VENDA", "10.PAGAMENTO BOLETO", "11.AGUARDANDO AVERBACAO",
    "12.AGUARDANDO ANUENCIA", "13.LIBERACAO TROCO", "14.OPERACAO SUSPENSA", "15.CANCELADOS", "16.AVERBADO",
    "17.PROBLEMA AVERBACAO", "18.AGUARDANDO CANCELAMENTO DO CARTÃO", "19.AGUARDANDO APROVACAO", "SEM USO",
  ];
  const SITUACOES = [["iniciado", "Iniciado"], ["em averbacao", "Em Averbação"], ["averbado", "Averbado"], ["cancelado", "Cancelado"]];
  const ORDENS = [
    ["inicio_desc", "Data de início (mais recentes)"], ["atualizado_desc", "Última atualização"], ["codigo", "Código do contrato"],
    ["cliente", "Cliente (A–Z)"], ["cpf", "CPF"], ["convenio", "Convênio"], ["operacao", "Operação"],
    ["situacao", "Situação"], ["producao_desc", "Produção (maior primeiro)"],
  ];
  const POR_PAGINA = 50;

  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const cmp = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });

  function parseData(v) {
    if (!v) return null;
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (m) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2]}-${m[1]}`; }
    return null;
  }

  // CSS do painel (injetado uma vez)
  if (!document.getElementById("cf-estilo")) {
    const st = document.createElement("style");
    st.id = "cf-estilo";
    st.textContent = `
      .cf-painel { background:#131c3d; border:1px solid #2a3868; border-radius:10px; margin-bottom:16px; }
      .cf-topo { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; cursor:pointer; user-select:none; }
      .cf-topo strong { color:#e8c766; }
      .cf-corpo { padding:4px 16px 16px; }
      .cf-corpo.fechado { display:none; }
      .cf-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:10px; }
      .cf-grid label.cf-rot, .cf-sub { display:block; font-size:11px; text-transform:uppercase; color:#9aa3c2; margin-bottom:4px; }
      .cf-grid input, .cf-grid select { width:100%; box-sizing:border-box; }
      .cf-sec { background:#1d2a55; color:#e8c766; text-align:center; font-size:12px; font-weight:bold; padding:6px; margin:10px 0 8px; border-radius:6px; }
      .cf-check { display:inline-flex; align-items:center; gap:6px; margin:2px 14px 2px 0; font-size:13px; }
      .cf-check input { width:16px; height:16px; }
      .cf-est { max-height:170px; overflow-y:auto; border:1px solid #2a3868; border-radius:8px; padding:8px 12px; }
      .cf-est .cf-check { display:flex; margin:3px 0; }
      .cf-acoes { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:12px; }
      .cf-pager { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0; font-size:13px; color:#9aa3c2; }
      .cf-pager button { padding:4px 10px; font-size:12px; }
      .cf-pager .cf-info { margin-left:auto; }
    `;
    document.head.appendChild(st);
  }

  function painelHtml(p, admin) {
    const id = (n) => `${p}_${n}`;
    return `
      <div class="cf-painel">
        <div class="cf-topo" id="${id("toggle")}"><strong>🔎 Filtros</strong><span class="hint" id="${id("seta")}">clique para recolher</span></div>
        <div class="cf-corpo" id="${id("corpo")}">
          <div class="cf-sec">Cliente</div>
          <div class="cf-grid">
            <div><label class="cf-rot">CPF</label><input type="text" id="${id("cpf")}" placeholder="Só números"></div>
            <div><label class="cf-rot">Nome, Nº ou Código do contrato</label><input type="text" id="${id("busca")}" placeholder="Buscar..."></div>
            ${admin ? `<div><label class="cf-rot">Vendedor / Consultor</label><select id="${id("consultor")}"><option value="">Todos</option><option value="__sem__">Sem consultor identificado</option></select></div>` : ""}
          </div>

          <div class="cf-sec">Detalhes do contrato</div>
          <div style="margin-bottom:10px;">
            <span class="cf-sub">Situação</span>
            ${SITUACOES.map(([v, r]) => `<label class="cf-check"><input type="checkbox" class="cf-sit" value="${v}"> ${r}</label>`).join("")}
          </div>
          <div class="cf-grid">
            <div><label class="cf-rot">Banco</label><select id="${id("banco")}"><option value="">Todos</option></select></div>
            <div><label class="cf-rot">Tipo</label><select id="${id("tipo")}"><option value="">Todos</option></select></div>
            <div><label class="cf-rot">Convênio</label><select id="${id("convenio")}"><option value="">Todos</option></select></div>
            <div><label class="cf-rot">Tabela</label><select id="${id("tabela")}"><option value="">Todas</option></select></div>
          </div>

          <div class="cf-sub" style="display:flex; justify-content:space-between;">
            <span>Esteira</span>
            <label class="cf-check" style="margin:0;"><input type="checkbox" id="${id("estTodas")}"> marcar todas</label>
          </div>
          <div class="cf-est" id="${id("esteiras")}"></div>

          <div class="cf-sec">Datas</div>
          <div class="cf-grid">
            <div><label class="cf-rot">Início — de</label><input type="date" id="${id("iniDe")}"></div>
            <div><label class="cf-rot">Início — até</label><input type="date" id="${id("iniAte")}"></div>
            <div><label class="cf-rot">Averbação — de</label><input type="date" id="${id("avDe")}"></div>
            <div><label class="cf-rot">Averbação — até</label><input type="date" id="${id("avAte")}"></div>
          </div>

          <div class="cf-sec">Ordenação</div>
          <div class="cf-grid">
            <div><label class="cf-rot">Ordenar por</label><select id="${id("ordem")}">${ORDENS.map(([v, r]) => `<option value="${v}">${r}</option>`).join("")}</select></div>
            <div style="display:flex; align-items:flex-end;"><label class="cf-check"><input type="checkbox" id="${id("pend")}"> Só com pendência</label></div>
          </div>

          <div class="cf-acoes">
            <button class="btn" id="${id("filtrar")}">Filtrar</button>
            <button class="btn secondary" id="${id("limpar")}">Limpar filtros</button>
            <span id="${id("extra")}"></span>
          </div>
        </div>
      </div>`;
  }

  function montar(el, opts) {
    const p = opts.prefixo || "cf";
    const admin = !!opts.admin;
    const aoMudar = opts.aoMudar || function () {};
    el.innerHTML = painelHtml(p, admin);
    const $ = (n) => document.getElementById(`${p}_${n}`);
    const raiz = el;

    function renderEsteiras(extras, marcadas) {
      const lista = [...ESTEIRAS];
      const ja = new Set(lista.map(norm));
      (extras || []).forEach((e) => { if (e && !ja.has(norm(e))) { lista.push(e); ja.add(norm(e)); } });
      $("esteiras").innerHTML = lista.map((e) => `<label class="cf-check"><input type="checkbox" class="cf-est-i" value="${esc(e)}" ${marcadas && marcadas.has(norm(e)) ? "checked" : ""}> ${esc(e)}</label>`).join("");
      raiz.querySelectorAll(".cf-est-i").forEach((c) => { c.onchange = () => aoMudar(true); });
    }
    renderEsteiras([], new Set());

    function estado() {
      return {
        cpf: $("cpf").value.replace(/\D/g, ""),
        busca: norm($("busca").value),
        situacoes: new Set([...raiz.querySelectorAll(".cf-sit:checked")].map((x) => x.value)),
        banco: $("banco").value, tipo: $("tipo").value, convenio: $("convenio").value, tabela: $("tabela").value,
        esteiras: new Set([...raiz.querySelectorAll(".cf-est-i:checked")].map((x) => norm(x.value))),
        consultor: admin ? $("consultor").value : "",
        soPend: $("pend").checked,
        iniDe: $("iniDe").value, iniAte: $("iniAte").value, avDe: $("avDe").value, avAte: $("avAte").value,
        ordem: $("ordem").value,
      };
    }

    function ordenar(lista, ordem) {
      const dataDesc = (campo) => (a, b) => {
        const x = a[campo] || "", y = b[campo] || "";
        if (!x && !y) return 0; if (!x) return 1; if (!y) return -1;
        return y.localeCompare(x);
      };
      const out = [...lista];
      switch (ordem) {
        case "codigo": out.sort((a, b) => cmp(a.numero_contrato, b.numero_contrato)); break;
        case "cliente": out.sort((a, b) => cmp(a.cliente_nome, b.cliente_nome)); break;
        case "cpf": out.sort((a, b) => cmp(a.cpf, b.cpf)); break;
        case "convenio": out.sort((a, b) => cmp(a.convenio, b.convenio)); break;
        case "operacao": out.sort((a, b) => cmp(a.operacao, b.operacao)); break;
        case "situacao": out.sort((a, b) => cmp(a.situacao, b.situacao)); break;
        case "producao_desc": out.sort((a, b) => (b.producao || 0) - (a.producao || 0)); break;
        case "atualizado_desc": out.sort(dataDesc("atualizado_em")); break;
        default: out.sort(dataDesc("data_inicio"));
      }
      return out;
    }

    function filtrar(dados) {
      const e = estado();
      const lista = dados.filter((c) => {
        if (e.cpf && !String(c.cpf || "").replace(/\D/g, "").includes(e.cpf)) return false;
        if (e.busca && !(norm(c.cliente_nome).includes(e.busca) || norm(c.numero_contrato).includes(e.busca) || norm(c.codigo).includes(e.busca))) return false;
        if (e.situacoes.size && !e.situacoes.has(norm(c.situacao))) return false;
        if (e.banco && (c.banco || "") !== e.banco) return false;
        if (e.tipo && (c.tipo || "") !== e.tipo) return false;
        if (e.convenio && (c.convenio || "") !== e.convenio) return false;
        if (e.tabela && (c.tabela || "") !== e.tabela) return false;
        if (e.esteiras.size && !e.esteiras.has(norm(c.esteira))) return false;
        if (e.consultor === "__sem__" && c.consultor_id) return false;
        if (e.consultor && e.consultor !== "__sem__" && c.consultor_id !== e.consultor) return false;
        if (e.soPend && !c.pendencias) return false;
        if (e.iniDe && (!c.data_inicio || c.data_inicio < e.iniDe)) return false;
        if (e.iniAte && (!c.data_inicio || c.data_inicio > e.iniAte)) return false;
        if (e.avDe || e.avAte) {
          const av = parseData(c.data_averbacao);
          if (!av) return false;
          if (e.avDe && av < e.avDe) return false;
          if (e.avAte && av > e.avAte) return false;
        }
        return true;
      });
      return ordenar(lista, e.ordem);
    }

    function preencherSelect(sel, valores, rotuloTodos) {
      const atual = sel.value;
      sel.innerHTML = `<option value="">${rotuloTodos}</option>` + valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      sel.value = valores.includes(atual) ? atual : "";
    }

    function atualizarOpcoes(dados) {
      const distintos = (campo) => [...new Set(dados.map((c) => c[campo]).filter(Boolean))].sort(cmp);
      preencherSelect($("banco"), distintos("banco"), "Todos");
      preencherSelect($("tipo"), distintos("tipo"), "Todos");
      preencherSelect($("convenio"), distintos("convenio"), "Todos");
      preencherSelect($("tabela"), distintos("tabela"), "Todas");
      const marcadas = new Set([...raiz.querySelectorAll(".cf-est-i:checked")].map((x) => norm(x.value)));
      renderEsteiras(distintos("esteira"), marcadas);
    }

    function definirConsultores(lista) {
      if (!admin) return;
      const sel = $("consultor");
      const atual = sel.value;
      sel.innerHTML = `<option value="">Todos</option><option value="__sem__">Sem consultor identificado</option>` +
        lista.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
      sel.value = atual;
    }

    function limpar() {
      ["cpf", "busca", "iniDe", "iniAte", "avDe", "avAte"].forEach((n) => { $(n).value = ""; });
      ["banco", "tipo", "convenio", "tabela"].forEach((n) => { $(n).value = ""; });
      if (admin) $("consultor").value = "";
      $("ordem").value = "inicio_desc";
      $("pend").checked = false; $("estTodas").checked = false;
      raiz.querySelectorAll(".cf-sit, .cf-est-i").forEach((c) => { c.checked = false; });
      aoMudar(true);
    }

    // eventos
    let t = null;
    ["cpf", "busca"].forEach((n) => {
      $(n).addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => aoMudar(true), 250); });
      $(n).addEventListener("keydown", (ev) => { if (ev.key === "Enter") aoMudar(true); });
    });
    ["banco", "tipo", "convenio", "tabela", "iniDe", "iniAte", "avDe", "avAte", "ordem", "pend"].forEach((n) => $(n).addEventListener("change", () => aoMudar(true)));
    if (admin) $("consultor").addEventListener("change", () => aoMudar(true));
    raiz.querySelectorAll(".cf-sit").forEach((c) => c.addEventListener("change", () => aoMudar(true)));
    $("estTodas").addEventListener("change", (ev) => { raiz.querySelectorAll(".cf-est-i").forEach((c) => { c.checked = ev.target.checked; }); aoMudar(true); });
    $("filtrar").addEventListener("click", () => aoMudar(true));
    $("limpar").addEventListener("click", limpar);
    $("toggle").addEventListener("click", () => {
      const corpo = $("corpo");
      corpo.classList.toggle("fechado");
      $("seta").textContent = corpo.classList.contains("fechado") ? "clique para abrir" : "clique para recolher";
    });

    return { estado, filtrar, atualizarOpcoes, definirConsultores, limpar, areaExtra: () => $("extra") };
  }

  function paginar(lista, pagina) {
    const total = lista.length;
    const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const pg = Math.min(Math.max(1, pagina || 1), totalPaginas);
    const ini = (pg - 1) * POR_PAGINA;
    return { itens: lista.slice(ini, ini + POR_PAGINA), pagina: pg, totalPaginas, de: total ? ini + 1 : 0, ate: Math.min(ini + POR_PAGINA, total), total };
  }

  function pagerHtml(info) {
    const d = (cond) => (cond ? "disabled" : "");
    return `<div class="cf-pager">
      <button class="btn secondary" data-pg="1" ${d(info.pagina <= 1)}>«</button>
      <button class="btn secondary" data-pg="${info.pagina - 1}" ${d(info.pagina <= 1)}>‹ Anterior</button>
      <span>Página <strong>${info.pagina}</strong> de ${info.totalPaginas}</span>
      <button class="btn secondary" data-pg="${info.pagina + 1}" ${d(info.pagina >= info.totalPaginas)}>Próxima ›</button>
      <button class="btn secondary" data-pg="${info.totalPaginas}" ${d(info.pagina >= info.totalPaginas)}>»</button>
      <span class="cf-info">Listando registros de ${info.de} a ${info.ate} do total de ${info.total}</span>
    </div>`;
  }

  function ligarPager(container, aoTrocar) {
    container.querySelectorAll("[data-pg]").forEach((b) => { b.onclick = () => aoTrocar(parseInt(b.dataset.pg, 10)); });
  }

  window.ContratosFiltros = { montar, paginar, pagerHtml, ligarPager, norm, parseData, POR_PAGINA };
})();
