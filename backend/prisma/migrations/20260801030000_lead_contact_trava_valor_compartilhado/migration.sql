-- TRAVA DE VALOR COMPARTILHADO no LeadContact
--
-- Motivo (medido em 01/08/2026): o enriquecimento profundo tratava DIRETORIO
-- (solutudo, locaisdobrasil, applocal, listaamarela...) como se fosse o site do
-- lead, crawleava 12 paginas + 24 links e colava o contato das empresas VIZINHAS.
-- Resultado: o telefone da propria Solutudo (1431470223) ficou em 803 leads,
-- o Instagram do diretorio em 80, `seu@email.com` em 11, um DSN do Sentry em 23.
-- 64,9% dos contatos de `website_crawl` estavam em valor repetido, contra 3,1%
-- do `columns_backfill`.
--
-- LEI: "contato que serve a muitos nao e de ninguem".
-- A trava mora AQUI e nao no worker, porque assim vale pra TODO gravador de
-- contato (crawl, backfill, cnpj, import) e pega diretorio que ainda nem nasceu
-- — engordar lista de dominio nunca acaba.
--
-- Teto = 10 leads distintos. Medido: compartilhamento legitimo (grupo economico,
-- contador, agencia do mesmo banco) termina em ~6; o veneno de diretorio vive
-- em 20+. O teto erra pro lado de DEIXAR ENTRAR, que e o certo num sistema aditivo.
--
-- A trava NAO apaga e NAO estoura excecao: ela recusa a linha nova e registra o
-- motivo em "LeadContactBloqueado". Trava que engole em silencio vira bug invisivel.

-- Registro append-only de tudo que a trava recusou. Sem ele a trava seria cega.
CREATE TABLE IF NOT EXISTS public."LeadContactBloqueado" (
  "id"              TEXT PRIMARY KEY,
  "radarLeadId"     TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "valueNormalized" TEXT NOT NULL,
  "source"          TEXT,
  "leadsComOValor"  INTEGER NOT NULL,
  "motivo"          TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "LeadContactBloqueado_valueNormalized_idx"
  ON public."LeadContactBloqueado" ("kind", "valueNormalized");
CREATE INDEX IF NOT EXISTS "LeadContactBloqueado_createdAt_idx"
  ON public."LeadContactBloqueado" ("createdAt");

-- Teto configuravel sem migration nova: basta trocar o COMMENT.
-- (mantido como funcao pra ficar num lugar so)
CREATE OR REPLACE FUNCTION public.hbx_teto_valor_compartilhado_v1()
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT 10 $$;

-- Fontes OFICIAIS (dump da Receita). Aqui valor repetido e a VERDADE LEGAL, nao
-- veneno: `cesup.platbh.mg@bb.com.br` esta em 103 CNPJs porque e o e-mail que o
-- Banco do Brasil declarou pras 103 agencias; o fiscal da Schindler em 78 filiais;
-- `dfct@eletrobras.com` em 54. Grupo economico compartilha contato de sede — isso
-- e cadastro, nao crawler perdido. Travar isso apagaria dado bom.
-- A trava existe pra dado RASPADO, onde repeticao significa que o robo se perdeu.
CREATE OR REPLACE FUNCTION public.hbx_fonte_oficial_v1(fonte text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT COALESCE(fonte, '') IN ('cnpj_public', 'cnpj_l4') $$;

CREATE OR REPLACE FUNCTION public.hbx_trava_valor_compartilhado_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  leads_com_o_valor integer;
  teto integer;
BEGIN
  -- So canais de contato entram na conta. Nada aqui interpreta negocio.
  IF NEW."kind" NOT IN ('phone', 'email', 'whatsapp', 'instagram', 'facebook') THEN
    RETURN NEW;
  END IF;

  -- Registro oficial da Receita passa direto (ver comentario acima).
  IF public.hbx_fonte_oficial_v1(NEW."source") THEN
    RETURN NEW;
  END IF;

  teto := public.hbx_teto_valor_compartilhado_v1();

  -- Usa o indice (kind, valueNormalized) que ja existe. LIMIT no teto pra nao
  -- varrer as 803 linhas do caso Solutudo a cada insert.
  SELECT count(*) INTO leads_com_o_valor
  FROM (
    SELECT DISTINCT existente."radarLeadId"
    FROM public."LeadContact" existente
    WHERE existente."kind" = NEW."kind"
      AND existente."valueNormalized" = NEW."valueNormalized"
      AND existente."radarLeadId" <> NEW."radarLeadId"
    LIMIT teto
  ) amostra;

  IF leads_com_o_valor >= teto THEN
    INSERT INTO public."LeadContactBloqueado" (
      "id", "radarLeadId", "kind", "value", "valueNormalized",
      "source", "leadsComOValor", "motivo"
    ) VALUES (
      'hbx_lcb_' || md5(NEW."radarLeadId" || ':' || NEW."kind" || ':' || NEW."valueNormalized"),
      NEW."radarLeadId", NEW."kind", NEW."value", NEW."valueNormalized",
      NEW."source", leads_com_o_valor, 'valor_compartilhado'
    )
    ON CONFLICT ("id") DO NOTHING;

    -- Recusa a linha. Quem chama ja trata "nao inseriu" (ON CONFLICT DO NOTHING
    -- + RETURNING no commit do enriquecimento), entao ninguem quebra.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "hbx_trava_valor_compartilhado" ON public."LeadContact";
CREATE TRIGGER "hbx_trava_valor_compartilhado"
  BEFORE INSERT ON public."LeadContact"
  FOR EACH ROW
  EXECUTE FUNCTION public.hbx_trava_valor_compartilhado_v1();

COMMENT ON FUNCTION public.hbx_trava_valor_compartilhado_v1() IS
  'LEI: contato que serve a muitos nao e de ninguem. Recusa contato cujo valor ja aparece em N+ leads (telefone de diretorio, placeholder de formulario, DSN de telemetria) e registra em LeadContactBloqueado. Teto em hbx_teto_valor_compartilhado_v1().';
