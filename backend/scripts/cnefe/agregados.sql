-- ─────────────────────────────────────────────────────────────────────────────────
-- AGREGADOS DE PORTA DO CNEFE — (município, rua, número) → pino, SEM depender de CEP.
--
-- 🔴 POR QUE ISTO EXISTE (09/08/2026). A cura de endereço nasceu em cima do CEP:
-- `cnefe_endereco` é indexada por (cep, numero), então cadastro SEM CEP tinha que
-- primeiro adivinhar o CEP no ViaCEP (achar a rua → casar o nome do trecho com o
-- bairro que o cliente usa → torcer pra faixa de numeração do Correio bater com a do
-- Censo). Medido na company 41: dos 91 clientes sem pino, 18 curavam. Só que o Censo
-- NUNCA precisou do CEP — ele guarda `cod_municipio` e `logradouro`. Com estes
-- agregados a mesma base responde (município, rua, número) numa consulta de chave
-- primária: 56 dos 91. Ver `resolverCnefePorta` em
-- backend/src/nucleo/cnefe-resolver.util.ts.
--
-- 🔴 A CHAVE `via_canon` TEM DUAS PONTAS. Aqui ela sai de `canon_via(norm_via(x))`; no
-- backend, de `canonVia()` (TypeScript). As duas TÊM que produzir a mesma string
-- ("AVENIDA NOVENTA E SEIS" e "Av. 96" viram os dois "av 96") — mudou uma, muda a
-- outra no MESMO commit, senão a consulta passa a não achar nada, calada.
-- Medido em 4.000 vias de SP: 3.981 batem. As 19 que sobram são só o token COLADO
-- ("1A TRAVESSA" → aqui "1a travessa", lá "1 a travessa"), porque o `canon_via` daqui
-- não separa letra de número e o backend separa (é o que faz "Av. M55" casar com
-- "AVENIDA M CINQUENTA E CINCO"). Por isso o backend pergunta pelas DUAS grafias
-- (`canonViaColada`) em vez de este script reconstruir SP inteira por 0,5%.
--
-- COMO RODAR (depois de `carregar-uf.sh`, que enche `cnefe_endereco`):
--   psql "$CNEFE_DATABASE_URL" -f backend/scripts/cnefe/agregados.sql
-- Reentrante: pode rodar de novo a qualquer momento (TRUNCATE + INSERT). Custa alguns
-- minutos numa UF grande; o backend segue funcionando pelo caminho do CEP enquanto
-- roda, e volta sozinho a usar a porta direta quando as tabelas aparecem.
-- ─────────────────────────────────────────────────────────────────────────────────
\timing on
SET statement_timeout='0';
SET work_mem='192MB';
SET maintenance_work_mem='512MB';

\echo '### 0/7 dicionario de numeral por extenso (o IBGE escreve "RUA OITO")'
CREATE TABLE IF NOT EXISTS num_pt (palavra text PRIMARY KEY, valor int);
TRUNCATE num_pt;
INSERT INTO num_pt (palavra, valor) VALUES
  ('zero',0),('um',1),('uma',1),('dois',2),('duas',2),('tres',3),
  ('quatro',4),('cinco',5),('seis',6),('sete',7),('oito',8),('nove',9),
  ('dez',10),('onze',11),('doze',12),('treze',13),('catorze',14),('quatorze',14),
  ('quinze',15),('dezasseis',16),('dezesseis',16),('dezassete',17),('dezessete',17),('dezoito',18),
  ('dezanove',19),('dezenove',19),('vinte',20),('vinte e um',21),('vinte e uma',21),('vinte e dois',22),
  ('vinte e duas',22),('vinte e tres',23),('vinte e quatro',24),('vinte e cinco',25),('vinte e seis',26),('vinte e sete',27),
  ('vinte e oito',28),('vinte e nove',29),('trinta',30),('trinta e um',31),('trinta e uma',31),('trinta e dois',32),
  ('trinta e duas',32),('trinta e tres',33),('trinta e quatro',34),('trinta e cinco',35),('trinta e seis',36),('trinta e sete',37),
  ('trinta e oito',38),('trinta e nove',39),('quarenta',40),('quarenta e um',41),('quarenta e uma',41),('quarenta e dois',42),
  ('quarenta e duas',42),('quarenta e tres',43),('quarenta e quatro',44),('quarenta e cinco',45),('quarenta e seis',46),('quarenta e sete',47),
  ('quarenta e oito',48),('quarenta e nove',49),('cincoenta',50),('cinquenta',50),('cincoenta e um',51),('cincoenta e uma',51),
  ('cinquenta e um',51),('cinquenta e uma',51),('cincoenta e dois',52),('cincoenta e duas',52),('cinquenta e dois',52),('cinquenta e duas',52),
  ('cincoenta e tres',53),('cinquenta e tres',53),('cincoenta e quatro',54),('cinquenta e quatro',54),('cincoenta e cinco',55),('cinquenta e cinco',55),
  ('cincoenta e seis',56),('cinquenta e seis',56),('cincoenta e sete',57),('cinquenta e sete',57),('cincoenta e oito',58),('cinquenta e oito',58),
  ('cincoenta e nove',59),('cinquenta e nove',59),('sessenta',60),('sessenta e um',61),('sessenta e uma',61),('sessenta e dois',62),
  ('sessenta e duas',62),('sessenta e tres',63),('sessenta e quatro',64),('sessenta e cinco',65),('sessenta e seis',66),('sessenta e sete',67),
  ('sessenta e oito',68),('sessenta e nove',69),('setenta',70),('setenta e um',71),('setenta e uma',71),('setenta e dois',72),
  ('setenta e duas',72),('setenta e tres',73),('setenta e quatro',74),('setenta e cinco',75),('setenta e seis',76),('setenta e sete',77),
  ('setenta e oito',78),('setenta e nove',79),('oitenta',80),('oitenta e um',81),('oitenta e uma',81),('oitenta e dois',82),
  ('oitenta e duas',82),('oitenta e tres',83),('oitenta e quatro',84),('oitenta e cinco',85),('oitenta e seis',86),('oitenta e sete',87),
  ('oitenta e oito',88),('oitenta e nove',89),('noventa',90),('noventa e um',91),('noventa e uma',91),('noventa e dois',92),
  ('noventa e duas',92),('noventa e tres',93),('noventa e quatro',94),('noventa e cinco',95),('noventa e seis',96),('noventa e sete',97),
  ('noventa e oito',98),('noventa e nove',99),('cem',100),('cento',100),('cento e um',101),('cento e uma',101),
  ('cento e dois',102),('cento e duas',102),('cento e tres',103),('cento e quatro',104),('cento e cinco',105),('cento e seis',106),
  ('cento e sete',107),('cento e oito',108),('cento e nove',109),('cento e dez',110),('cento e onze',111),('cento e doze',112),
  ('cento e treze',113),('cento e catorze',114),('cento e quatorze',114),('cento e quinze',115),('cento e dezasseis',116),('cento e dezesseis',116),
  ('cento e dezassete',117),('cento e dezessete',117),('cento e dezoito',118),('cento e dezanove',119),('cento e dezenove',119),('cento e vinte',120),
  ('cento e vinte e um',121),('cento e vinte e uma',121),('cento e vinte e dois',122),('cento e vinte e duas',122),('cento e vinte e tres',123),('cento e vinte e quatro',124),
  ('cento e vinte e cinco',125),('cento e vinte e seis',126),('cento e vinte e sete',127),('cento e vinte e oito',128),('cento e vinte e nove',129),('cento e trinta',130),
  ('cento e trinta e um',131),('cento e trinta e uma',131),('cento e trinta e dois',132),('cento e trinta e duas',132),('cento e trinta e tres',133),('cento e trinta e quatro',134),
  ('cento e trinta e cinco',135),('cento e trinta e seis',136),('cento e trinta e sete',137),('cento e trinta e oito',138),('cento e trinta e nove',139),('cento e quarenta',140),
  ('cento e quarenta e um',141),('cento e quarenta e uma',141),('cento e quarenta e dois',142),('cento e quarenta e duas',142),('cento e quarenta e tres',143),('cento e quarenta e quatro',144),
  ('cento e quarenta e cinco',145),('cento e quarenta e seis',146),('cento e quarenta e sete',147),('cento e quarenta e oito',148),('cento e quarenta e nove',149),('cento e cincoenta',150),
  ('cento e cinquenta',150),('cento e cincoenta e um',151),('cento e cincoenta e uma',151),('cento e cinquenta e um',151),('cento e cinquenta e uma',151),('cento e cincoenta e dois',152),
  ('cento e cincoenta e duas',152),('cento e cinquenta e dois',152),('cento e cinquenta e duas',152),('cento e cincoenta e tres',153),('cento e cinquenta e tres',153),('cento e cincoenta e quatro',154),
  ('cento e cinquenta e quatro',154),('cento e cincoenta e cinco',155),('cento e cinquenta e cinco',155),('cento e cincoenta e seis',156),('cento e cinquenta e seis',156),('cento e cincoenta e sete',157),
  ('cento e cinquenta e sete',157),('cento e cincoenta e oito',158),('cento e cinquenta e oito',158),('cento e cincoenta e nove',159),('cento e cinquenta e nove',159),('cento e sessenta',160),
  ('cento e sessenta e um',161),('cento e sessenta e uma',161),('cento e sessenta e dois',162),('cento e sessenta e duas',162),('cento e sessenta e tres',163),('cento e sessenta e quatro',164),
  ('cento e sessenta e cinco',165),('cento e sessenta e seis',166),('cento e sessenta e sete',167),('cento e sessenta e oito',168),('cento e sessenta e nove',169),('cento e setenta',170),
  ('cento e setenta e um',171),('cento e setenta e uma',171),('cento e setenta e dois',172),('cento e setenta e duas',172),('cento e setenta e tres',173),('cento e setenta e quatro',174),
  ('cento e setenta e cinco',175),('cento e setenta e seis',176),('cento e setenta e sete',177),('cento e setenta e oito',178),('cento e setenta e nove',179),('cento e oitenta',180),
  ('cento e oitenta e um',181),('cento e oitenta e uma',181),('cento e oitenta e dois',182),('cento e oitenta e duas',182),('cento e oitenta e tres',183),('cento e oitenta e quatro',184),
  ('cento e oitenta e cinco',185),('cento e oitenta e seis',186),('cento e oitenta e sete',187),('cento e oitenta e oito',188),('cento e oitenta e nove',189),('cento e noventa',190),
  ('cento e noventa e um',191),('cento e noventa e uma',191),('cento e noventa e dois',192),('cento e noventa e duas',192),('cento e noventa e tres',193),('cento e noventa e quatro',194),
  ('cento e noventa e cinco',195),('cento e noventa e seis',196),('cento e noventa e sete',197),('cento e noventa e oito',198),('cento e noventa e nove',199),('duzentos',200),
  ('duzentos e um',201),('duzentos e uma',201),('duzentos e dois',202),('duzentos e duas',202),('duzentos e tres',203),('duzentos e quatro',204),
  ('duzentos e cinco',205),('duzentos e seis',206),('duzentos e sete',207),('duzentos e oito',208),('duzentos e nove',209),('duzentos e dez',210),
  ('duzentos e onze',211),('duzentos e doze',212),('duzentos e treze',213),('duzentos e catorze',214),('duzentos e quatorze',214),('duzentos e quinze',215),
  ('duzentos e dezasseis',216),('duzentos e dezesseis',216),('duzentos e dezassete',217),('duzentos e dezessete',217),('duzentos e dezoito',218),('duzentos e dezanove',219),
  ('duzentos e dezenove',219),('duzentos e vinte',220),('duzentos e vinte e um',221),('duzentos e vinte e uma',221),('duzentos e vinte e dois',222),('duzentos e vinte e duas',222),
  ('duzentos e vinte e tres',223),('duzentos e vinte e quatro',224),('duzentos e vinte e cinco',225),('duzentos e vinte e seis',226),('duzentos e vinte e sete',227),('duzentos e vinte e oito',228),
  ('duzentos e vinte e nove',229),('duzentos e trinta',230),('duzentos e trinta e um',231),('duzentos e trinta e uma',231),('duzentos e trinta e dois',232),('duzentos e trinta e duas',232),
  ('duzentos e trinta e tres',233),('duzentos e trinta e quatro',234),('duzentos e trinta e cinco',235),('duzentos e trinta e seis',236),('duzentos e trinta e sete',237),('duzentos e trinta e oito',238),
  ('duzentos e trinta e nove',239),('duzentos e quarenta',240),('duzentos e quarenta e um',241),('duzentos e quarenta e uma',241),('duzentos e quarenta e dois',242),('duzentos e quarenta e duas',242),
  ('duzentos e quarenta e tres',243),('duzentos e quarenta e quatro',244),('duzentos e quarenta e cinco',245),('duzentos e quarenta e seis',246),('duzentos e quarenta e sete',247),('duzentos e quarenta e oito',248),
  ('duzentos e quarenta e nove',249),('duzentos e cincoenta',250),('duzentos e cinquenta',250),('duzentos e cincoenta e um',251),('duzentos e cincoenta e uma',251),('duzentos e cinquenta e um',251),
  ('duzentos e cinquenta e uma',251),('duzentos e cincoenta e dois',252),('duzentos e cincoenta e duas',252),('duzentos e cinquenta e dois',252),('duzentos e cinquenta e duas',252),('duzentos e cincoenta e tres',253),
  ('duzentos e cinquenta e tres',253),('duzentos e cincoenta e quatro',254),('duzentos e cinquenta e quatro',254),('duzentos e cincoenta e cinco',255),('duzentos e cinquenta e cinco',255),('duzentos e cincoenta e seis',256),
  ('duzentos e cinquenta e seis',256),('duzentos e cincoenta e sete',257),('duzentos e cinquenta e sete',257),('duzentos e cincoenta e oito',258),('duzentos e cinquenta e oito',258),('duzentos e cincoenta e nove',259),
  ('duzentos e cinquenta e nove',259),('duzentos e sessenta',260),('duzentos e sessenta e um',261),('duzentos e sessenta e uma',261),('duzentos e sessenta e dois',262),('duzentos e sessenta e duas',262),
  ('duzentos e sessenta e tres',263),('duzentos e sessenta e quatro',264),('duzentos e sessenta e cinco',265),('duzentos e sessenta e seis',266),('duzentos e sessenta e sete',267),('duzentos e sessenta e oito',268),
  ('duzentos e sessenta e nove',269),('duzentos e setenta',270),('duzentos e setenta e um',271),('duzentos e setenta e uma',271),('duzentos e setenta e dois',272),('duzentos e setenta e duas',272),
  ('duzentos e setenta e tres',273),('duzentos e setenta e quatro',274),('duzentos e setenta e cinco',275),('duzentos e setenta e seis',276),('duzentos e setenta e sete',277),('duzentos e setenta e oito',278),
  ('duzentos e setenta e nove',279),('duzentos e oitenta',280),('duzentos e oitenta e um',281),('duzentos e oitenta e uma',281),('duzentos e oitenta e dois',282),('duzentos e oitenta e duas',282),
  ('duzentos e oitenta e tres',283),('duzentos e oitenta e quatro',284),('duzentos e oitenta e cinco',285),('duzentos e oitenta e seis',286),('duzentos e oitenta e sete',287),('duzentos e oitenta e oito',288),
  ('duzentos e oitenta e nove',289),('duzentos e noventa',290),('duzentos e noventa e um',291),('duzentos e noventa e uma',291),('duzentos e noventa e dois',292),('duzentos e noventa e duas',292),
  ('duzentos e noventa e tres',293),('duzentos e noventa e quatro',294),('duzentos e noventa e cinco',295),('duzentos e noventa e seis',296),('duzentos e noventa e sete',297),('duzentos e noventa e oito',298),
  ('duzentos e noventa e nove',299),('trezentos',300),('trezentos e um',301),('trezentos e uma',301),('trezentos e dois',302),('trezentos e duas',302),
  ('trezentos e tres',303),('trezentos e quatro',304),('trezentos e cinco',305),('trezentos e seis',306),('trezentos e sete',307),('trezentos e oito',308),
  ('trezentos e nove',309),('trezentos e dez',310),('trezentos e onze',311),('trezentos e doze',312),('trezentos e treze',313),('trezentos e catorze',314),
  ('trezentos e quatorze',314),('trezentos e quinze',315),('trezentos e dezasseis',316),('trezentos e dezesseis',316),('trezentos e dezassete',317),('trezentos e dezessete',317),
  ('trezentos e dezoito',318),('trezentos e dezanove',319),('trezentos e dezenove',319),('trezentos e vinte',320),('trezentos e vinte e um',321),('trezentos e vinte e uma',321),
  ('trezentos e vinte e dois',322),('trezentos e vinte e duas',322),('trezentos e vinte e tres',323),('trezentos e vinte e quatro',324),('trezentos e vinte e cinco',325),('trezentos e vinte e seis',326),
  ('trezentos e vinte e sete',327),('trezentos e vinte e oito',328),('trezentos e vinte e nove',329),('trezentos e trinta',330),('trezentos e trinta e um',331),('trezentos e trinta e uma',331),
  ('trezentos e trinta e dois',332),('trezentos e trinta e duas',332),('trezentos e trinta e tres',333),('trezentos e trinta e quatro',334),('trezentos e trinta e cinco',335),('trezentos e trinta e seis',336),
  ('trezentos e trinta e sete',337),('trezentos e trinta e oito',338),('trezentos e trinta e nove',339),('trezentos e quarenta',340),('trezentos e quarenta e um',341),('trezentos e quarenta e uma',341),
  ('trezentos e quarenta e dois',342),('trezentos e quarenta e duas',342),('trezentos e quarenta e tres',343),('trezentos e quarenta e quatro',344),('trezentos e quarenta e cinco',345),('trezentos e quarenta e seis',346),
  ('trezentos e quarenta e sete',347),('trezentos e quarenta e oito',348),('trezentos e quarenta e nove',349),('trezentos e cincoenta',350),('trezentos e cinquenta',350),('trezentos e cincoenta e um',351),
  ('trezentos e cincoenta e uma',351),('trezentos e cinquenta e um',351),('trezentos e cinquenta e uma',351),('trezentos e cincoenta e dois',352),('trezentos e cincoenta e duas',352),('trezentos e cinquenta e dois',352),
  ('trezentos e cinquenta e duas',352),('trezentos e cincoenta e tres',353),('trezentos e cinquenta e tres',353),('trezentos e cincoenta e quatro',354),('trezentos e cinquenta e quatro',354),('trezentos e cincoenta e cinco',355),
  ('trezentos e cinquenta e cinco',355),('trezentos e cincoenta e seis',356),('trezentos e cinquenta e seis',356),('trezentos e cincoenta e sete',357),('trezentos e cinquenta e sete',357),('trezentos e cincoenta e oito',358),
  ('trezentos e cinquenta e oito',358),('trezentos e cincoenta e nove',359),('trezentos e cinquenta e nove',359),('trezentos e sessenta',360),('trezentos e sessenta e um',361),('trezentos e sessenta e uma',361),
  ('trezentos e sessenta e dois',362),('trezentos e sessenta e duas',362),('trezentos e sessenta e tres',363),('trezentos e sessenta e quatro',364),('trezentos e sessenta e cinco',365),('trezentos e sessenta e seis',366),
  ('trezentos e sessenta e sete',367),('trezentos e sessenta e oito',368),('trezentos e sessenta e nove',369),('trezentos e setenta',370),('trezentos e setenta e um',371),('trezentos e setenta e uma',371),
  ('trezentos e setenta e dois',372),('trezentos e setenta e duas',372),('trezentos e setenta e tres',373),('trezentos e setenta e quatro',374),('trezentos e setenta e cinco',375),('trezentos e setenta e seis',376),
  ('trezentos e setenta e sete',377),('trezentos e setenta e oito',378),('trezentos e setenta e nove',379),('trezentos e oitenta',380),('trezentos e oitenta e um',381),('trezentos e oitenta e uma',381),
  ('trezentos e oitenta e dois',382),('trezentos e oitenta e duas',382),('trezentos e oitenta e tres',383),('trezentos e oitenta e quatro',384),('trezentos e oitenta e cinco',385),('trezentos e oitenta e seis',386),
  ('trezentos e oitenta e sete',387),('trezentos e oitenta e oito',388),('trezentos e oitenta e nove',389),('trezentos e noventa',390),('trezentos e noventa e um',391),('trezentos e noventa e uma',391),
  ('trezentos e noventa e dois',392),('trezentos e noventa e duas',392),('trezentos e noventa e tres',393),('trezentos e noventa e quatro',394),('trezentos e noventa e cinco',395),('trezentos e noventa e seis',396),
  ('trezentos e noventa e sete',397),('trezentos e noventa e oito',398),('trezentos e noventa e nove',399),('quatrocentos',400),('quatrocentos e um',401),('quatrocentos e uma',401),
  ('quatrocentos e dois',402),('quatrocentos e duas',402),('quatrocentos e tres',403),('quatrocentos e quatro',404),('quatrocentos e cinco',405),('quatrocentos e seis',406),
  ('quatrocentos e sete',407),('quatrocentos e oito',408),('quatrocentos e nove',409),('quatrocentos e dez',410),('quatrocentos e onze',411),('quatrocentos e doze',412),
  ('quatrocentos e treze',413),('quatrocentos e catorze',414),('quatrocentos e quatorze',414),('quatrocentos e quinze',415),('quatrocentos e dezasseis',416),('quatrocentos e dezesseis',416),
  ('quatrocentos e dezassete',417),('quatrocentos e dezessete',417),('quatrocentos e dezoito',418),('quatrocentos e dezanove',419),('quatrocentos e dezenove',419),('quatrocentos e vinte',420),
  ('quatrocentos e vinte e um',421),('quatrocentos e vinte e uma',421),('quatrocentos e vinte e dois',422),('quatrocentos e vinte e duas',422),('quatrocentos e vinte e tres',423),('quatrocentos e vinte e quatro',424),
  ('quatrocentos e vinte e cinco',425),('quatrocentos e vinte e seis',426),('quatrocentos e vinte e sete',427),('quatrocentos e vinte e oito',428),('quatrocentos e vinte e nove',429),('quatrocentos e trinta',430),
  ('quatrocentos e trinta e um',431),('quatrocentos e trinta e uma',431),('quatrocentos e trinta e dois',432),('quatrocentos e trinta e duas',432),('quatrocentos e trinta e tres',433),('quatrocentos e trinta e quatro',434),
  ('quatrocentos e trinta e cinco',435),('quatrocentos e trinta e seis',436),('quatrocentos e trinta e sete',437),('quatrocentos e trinta e oito',438),('quatrocentos e trinta e nove',439),('quatrocentos e quarenta',440),
  ('quatrocentos e quarenta e um',441),('quatrocentos e quarenta e uma',441),('quatrocentos e quarenta e dois',442),('quatrocentos e quarenta e duas',442),('quatrocentos e quarenta e tres',443),('quatrocentos e quarenta e quatro',444),
  ('quatrocentos e quarenta e cinco',445),('quatrocentos e quarenta e seis',446),('quatrocentos e quarenta e sete',447),('quatrocentos e quarenta e oito',448),('quatrocentos e quarenta e nove',449),('quatrocentos e cincoenta',450),
  ('quatrocentos e cinquenta',450),('quatrocentos e cincoenta e um',451),('quatrocentos e cincoenta e uma',451),('quatrocentos e cinquenta e um',451),('quatrocentos e cinquenta e uma',451),('quatrocentos e cincoenta e dois',452),
  ('quatrocentos e cincoenta e duas',452),('quatrocentos e cinquenta e dois',452),('quatrocentos e cinquenta e duas',452),('quatrocentos e cincoenta e tres',453),('quatrocentos e cinquenta e tres',453),('quatrocentos e cincoenta e quatro',454),
  ('quatrocentos e cinquenta e quatro',454),('quatrocentos e cincoenta e cinco',455),('quatrocentos e cinquenta e cinco',455),('quatrocentos e cincoenta e seis',456),('quatrocentos e cinquenta e seis',456),('quatrocentos e cincoenta e sete',457),
  ('quatrocentos e cinquenta e sete',457),('quatrocentos e cincoenta e oito',458),('quatrocentos e cinquenta e oito',458),('quatrocentos e cincoenta e nove',459),('quatrocentos e cinquenta e nove',459),('quatrocentos e sessenta',460),
  ('quatrocentos e sessenta e um',461),('quatrocentos e sessenta e uma',461),('quatrocentos e sessenta e dois',462),('quatrocentos e sessenta e duas',462),('quatrocentos e sessenta e tres',463),('quatrocentos e sessenta e quatro',464),
  ('quatrocentos e sessenta e cinco',465),('quatrocentos e sessenta e seis',466),('quatrocentos e sessenta e sete',467),('quatrocentos e sessenta e oito',468),('quatrocentos e sessenta e nove',469),('quatrocentos e setenta',470),
  ('quatrocentos e setenta e um',471),('quatrocentos e setenta e uma',471),('quatrocentos e setenta e dois',472),('quatrocentos e setenta e duas',472),('quatrocentos e setenta e tres',473),('quatrocentos e setenta e quatro',474),
  ('quatrocentos e setenta e cinco',475),('quatrocentos e setenta e seis',476),('quatrocentos e setenta e sete',477),('quatrocentos e setenta e oito',478),('quatrocentos e setenta e nove',479),('quatrocentos e oitenta',480),
  ('quatrocentos e oitenta e um',481),('quatrocentos e oitenta e uma',481),('quatrocentos e oitenta e dois',482),('quatrocentos e oitenta e duas',482),('quatrocentos e oitenta e tres',483),('quatrocentos e oitenta e quatro',484),
  ('quatrocentos e oitenta e cinco',485),('quatrocentos e oitenta e seis',486),('quatrocentos e oitenta e sete',487),('quatrocentos e oitenta e oito',488),('quatrocentos e oitenta e nove',489),('quatrocentos e noventa',490),
  ('quatrocentos e noventa e um',491),('quatrocentos e noventa e uma',491),('quatrocentos e noventa e dois',492),('quatrocentos e noventa e duas',492),('quatrocentos e noventa e tres',493),('quatrocentos e noventa e quatro',494),
  ('quatrocentos e noventa e cinco',495),('quatrocentos e noventa e seis',496),('quatrocentos e noventa e sete',497),('quatrocentos e noventa e oito',498),('quatrocentos e noventa e nove',499),('quinhentos',500),
  ('quinhentos e um',501),('quinhentos e uma',501),('quinhentos e dois',502),('quinhentos e duas',502),('quinhentos e tres',503),('quinhentos e quatro',504),
  ('quinhentos e cinco',505),('quinhentos e seis',506),('quinhentos e sete',507),('quinhentos e oito',508),('quinhentos e nove',509),('quinhentos e dez',510),
  ('quinhentos e onze',511),('quinhentos e doze',512),('quinhentos e treze',513),('quinhentos e catorze',514),('quinhentos e quatorze',514),('quinhentos e quinze',515),
  ('quinhentos e dezasseis',516),('quinhentos e dezesseis',516),('quinhentos e dezassete',517),('quinhentos e dezessete',517),('quinhentos e dezoito',518),('quinhentos e dezanove',519),
  ('quinhentos e dezenove',519),('quinhentos e vinte',520),('quinhentos e vinte e um',521),('quinhentos e vinte e uma',521),('quinhentos e vinte e dois',522),('quinhentos e vinte e duas',522),
  ('quinhentos e vinte e tres',523),('quinhentos e vinte e quatro',524),('quinhentos e vinte e cinco',525),('quinhentos e vinte e seis',526),('quinhentos e vinte e sete',527),('quinhentos e vinte e oito',528),
  ('quinhentos e vinte e nove',529),('quinhentos e trinta',530),('quinhentos e trinta e um',531),('quinhentos e trinta e uma',531),('quinhentos e trinta e dois',532),('quinhentos e trinta e duas',532),
  ('quinhentos e trinta e tres',533),('quinhentos e trinta e quatro',534),('quinhentos e trinta e cinco',535),('quinhentos e trinta e seis',536),('quinhentos e trinta e sete',537),('quinhentos e trinta e oito',538),
  ('quinhentos e trinta e nove',539),('quinhentos e quarenta',540),('quinhentos e quarenta e um',541),('quinhentos e quarenta e uma',541),('quinhentos e quarenta e dois',542),('quinhentos e quarenta e duas',542),
  ('quinhentos e quarenta e tres',543),('quinhentos e quarenta e quatro',544),('quinhentos e quarenta e cinco',545),('quinhentos e quarenta e seis',546),('quinhentos e quarenta e sete',547),('quinhentos e quarenta e oito',548),
  ('quinhentos e quarenta e nove',549),('quinhentos e cincoenta',550),('quinhentos e cinquenta',550),('quinhentos e cincoenta e um',551),('quinhentos e cincoenta e uma',551),('quinhentos e cinquenta e um',551),
  ('quinhentos e cinquenta e uma',551),('quinhentos e cincoenta e dois',552),('quinhentos e cincoenta e duas',552),('quinhentos e cinquenta e dois',552),('quinhentos e cinquenta e duas',552),('quinhentos e cincoenta e tres',553),
  ('quinhentos e cinquenta e tres',553),('quinhentos e cincoenta e quatro',554),('quinhentos e cinquenta e quatro',554),('quinhentos e cincoenta e cinco',555),('quinhentos e cinquenta e cinco',555),('quinhentos e cincoenta e seis',556),
  ('quinhentos e cinquenta e seis',556),('quinhentos e cincoenta e sete',557),('quinhentos e cinquenta e sete',557),('quinhentos e cincoenta e oito',558),('quinhentos e cinquenta e oito',558),('quinhentos e cincoenta e nove',559),
  ('quinhentos e cinquenta e nove',559),('quinhentos e sessenta',560),('quinhentos e sessenta e um',561),('quinhentos e sessenta e uma',561),('quinhentos e sessenta e dois',562),('quinhentos e sessenta e duas',562),
  ('quinhentos e sessenta e tres',563),('quinhentos e sessenta e quatro',564),('quinhentos e sessenta e cinco',565),('quinhentos e sessenta e seis',566),('quinhentos e sessenta e sete',567),('quinhentos e sessenta e oito',568),
  ('quinhentos e sessenta e nove',569),('quinhentos e setenta',570),('quinhentos e setenta e um',571),('quinhentos e setenta e uma',571),('quinhentos e setenta e dois',572),('quinhentos e setenta e duas',572),
  ('quinhentos e setenta e tres',573),('quinhentos e setenta e quatro',574),('quinhentos e setenta e cinco',575),('quinhentos e setenta e seis',576),('quinhentos e setenta e sete',577),('quinhentos e setenta e oito',578),
  ('quinhentos e setenta e nove',579),('quinhentos e oitenta',580),('quinhentos e oitenta e um',581),('quinhentos e oitenta e uma',581),('quinhentos e oitenta e dois',582),('quinhentos e oitenta e duas',582),
  ('quinhentos e oitenta e tres',583),('quinhentos e oitenta e quatro',584),('quinhentos e oitenta e cinco',585),('quinhentos e oitenta e seis',586),('quinhentos e oitenta e sete',587),('quinhentos e oitenta e oito',588),
  ('quinhentos e oitenta e nove',589),('quinhentos e noventa',590),('quinhentos e noventa e um',591),('quinhentos e noventa e uma',591),('quinhentos e noventa e dois',592),('quinhentos e noventa e duas',592),
  ('quinhentos e noventa e tres',593),('quinhentos e noventa e quatro',594),('quinhentos e noventa e cinco',595),('quinhentos e noventa e seis',596),('quinhentos e noventa e sete',597),('quinhentos e noventa e oito',598),
  ('quinhentos e noventa e nove',599),('seiscentos',600),('seiscentos e um',601),('seiscentos e uma',601),('seiscentos e dois',602),('seiscentos e duas',602),
  ('seiscentos e tres',603),('seiscentos e quatro',604),('seiscentos e cinco',605),('seiscentos e seis',606),('seiscentos e sete',607),('seiscentos e oito',608),
  ('seiscentos e nove',609),('seiscentos e dez',610),('seiscentos e onze',611),('seiscentos e doze',612),('seiscentos e treze',613),('seiscentos e catorze',614),
  ('seiscentos e quatorze',614),('seiscentos e quinze',615),('seiscentos e dezasseis',616),('seiscentos e dezesseis',616),('seiscentos e dezassete',617),('seiscentos e dezessete',617),
  ('seiscentos e dezoito',618),('seiscentos e dezanove',619),('seiscentos e dezenove',619),('seiscentos e vinte',620),('seiscentos e vinte e um',621),('seiscentos e vinte e uma',621),
  ('seiscentos e vinte e dois',622),('seiscentos e vinte e duas',622),('seiscentos e vinte e tres',623),('seiscentos e vinte e quatro',624),('seiscentos e vinte e cinco',625),('seiscentos e vinte e seis',626),
  ('seiscentos e vinte e sete',627),('seiscentos e vinte e oito',628),('seiscentos e vinte e nove',629),('seiscentos e trinta',630),('seiscentos e trinta e um',631),('seiscentos e trinta e uma',631),
  ('seiscentos e trinta e dois',632),('seiscentos e trinta e duas',632),('seiscentos e trinta e tres',633),('seiscentos e trinta e quatro',634),('seiscentos e trinta e cinco',635),('seiscentos e trinta e seis',636),
  ('seiscentos e trinta e sete',637),('seiscentos e trinta e oito',638),('seiscentos e trinta e nove',639),('seiscentos e quarenta',640),('seiscentos e quarenta e um',641),('seiscentos e quarenta e uma',641),
  ('seiscentos e quarenta e dois',642),('seiscentos e quarenta e duas',642),('seiscentos e quarenta e tres',643),('seiscentos e quarenta e quatro',644),('seiscentos e quarenta e cinco',645),('seiscentos e quarenta e seis',646),
  ('seiscentos e quarenta e sete',647),('seiscentos e quarenta e oito',648),('seiscentos e quarenta e nove',649),('seiscentos e cincoenta',650),('seiscentos e cinquenta',650),('seiscentos e cincoenta e um',651),
  ('seiscentos e cincoenta e uma',651),('seiscentos e cinquenta e um',651),('seiscentos e cinquenta e uma',651),('seiscentos e cincoenta e dois',652),('seiscentos e cincoenta e duas',652),('seiscentos e cinquenta e dois',652),
  ('seiscentos e cinquenta e duas',652),('seiscentos e cincoenta e tres',653),('seiscentos e cinquenta e tres',653),('seiscentos e cincoenta e quatro',654),('seiscentos e cinquenta e quatro',654),('seiscentos e cincoenta e cinco',655),
  ('seiscentos e cinquenta e cinco',655),('seiscentos e cincoenta e seis',656),('seiscentos e cinquenta e seis',656),('seiscentos e cincoenta e sete',657),('seiscentos e cinquenta e sete',657),('seiscentos e cincoenta e oito',658),
  ('seiscentos e cinquenta e oito',658),('seiscentos e cincoenta e nove',659),('seiscentos e cinquenta e nove',659),('seiscentos e sessenta',660),('seiscentos e sessenta e um',661),('seiscentos e sessenta e uma',661),
  ('seiscentos e sessenta e dois',662),('seiscentos e sessenta e duas',662),('seiscentos e sessenta e tres',663),('seiscentos e sessenta e quatro',664),('seiscentos e sessenta e cinco',665),('seiscentos e sessenta e seis',666),
  ('seiscentos e sessenta e sete',667),('seiscentos e sessenta e oito',668),('seiscentos e sessenta e nove',669),('seiscentos e setenta',670),('seiscentos e setenta e um',671),('seiscentos e setenta e uma',671),
  ('seiscentos e setenta e dois',672),('seiscentos e setenta e duas',672),('seiscentos e setenta e tres',673),('seiscentos e setenta e quatro',674),('seiscentos e setenta e cinco',675),('seiscentos e setenta e seis',676),
  ('seiscentos e setenta e sete',677),('seiscentos e setenta e oito',678),('seiscentos e setenta e nove',679),('seiscentos e oitenta',680),('seiscentos e oitenta e um',681),('seiscentos e oitenta e uma',681),
  ('seiscentos e oitenta e dois',682),('seiscentos e oitenta e duas',682),('seiscentos e oitenta e tres',683),('seiscentos e oitenta e quatro',684),('seiscentos e oitenta e cinco',685),('seiscentos e oitenta e seis',686),
  ('seiscentos e oitenta e sete',687),('seiscentos e oitenta e oito',688),('seiscentos e oitenta e nove',689),('seiscentos e noventa',690),('seiscentos e noventa e um',691),('seiscentos e noventa e uma',691),
  ('seiscentos e noventa e dois',692),('seiscentos e noventa e duas',692),('seiscentos e noventa e tres',693),('seiscentos e noventa e quatro',694),('seiscentos e noventa e cinco',695),('seiscentos e noventa e seis',696),
  ('seiscentos e noventa e sete',697),('seiscentos e noventa e oito',698),('seiscentos e noventa e nove',699),('setecentos',700),('setecentos e um',701),('setecentos e uma',701),
  ('setecentos e dois',702),('setecentos e duas',702),('setecentos e tres',703),('setecentos e quatro',704),('setecentos e cinco',705),('setecentos e seis',706),
  ('setecentos e sete',707),('setecentos e oito',708),('setecentos e nove',709),('setecentos e dez',710),('setecentos e onze',711),('setecentos e doze',712),
  ('setecentos e treze',713),('setecentos e catorze',714),('setecentos e quatorze',714),('setecentos e quinze',715),('setecentos e dezasseis',716),('setecentos e dezesseis',716),
  ('setecentos e dezassete',717),('setecentos e dezessete',717),('setecentos e dezoito',718),('setecentos e dezanove',719),('setecentos e dezenove',719),('setecentos e vinte',720),
  ('setecentos e vinte e um',721),('setecentos e vinte e uma',721),('setecentos e vinte e dois',722),('setecentos e vinte e duas',722),('setecentos e vinte e tres',723),('setecentos e vinte e quatro',724),
  ('setecentos e vinte e cinco',725),('setecentos e vinte e seis',726),('setecentos e vinte e sete',727),('setecentos e vinte e oito',728),('setecentos e vinte e nove',729),('setecentos e trinta',730),
  ('setecentos e trinta e um',731),('setecentos e trinta e uma',731),('setecentos e trinta e dois',732),('setecentos e trinta e duas',732),('setecentos e trinta e tres',733),('setecentos e trinta e quatro',734),
  ('setecentos e trinta e cinco',735),('setecentos e trinta e seis',736),('setecentos e trinta e sete',737),('setecentos e trinta e oito',738),('setecentos e trinta e nove',739),('setecentos e quarenta',740),
  ('setecentos e quarenta e um',741),('setecentos e quarenta e uma',741),('setecentos e quarenta e dois',742),('setecentos e quarenta e duas',742),('setecentos e quarenta e tres',743),('setecentos e quarenta e quatro',744),
  ('setecentos e quarenta e cinco',745),('setecentos e quarenta e seis',746),('setecentos e quarenta e sete',747),('setecentos e quarenta e oito',748),('setecentos e quarenta e nove',749),('setecentos e cincoenta',750),
  ('setecentos e cinquenta',750),('setecentos e cincoenta e um',751),('setecentos e cincoenta e uma',751),('setecentos e cinquenta e um',751),('setecentos e cinquenta e uma',751),('setecentos e cincoenta e dois',752),
  ('setecentos e cincoenta e duas',752),('setecentos e cinquenta e dois',752),('setecentos e cinquenta e duas',752),('setecentos e cincoenta e tres',753),('setecentos e cinquenta e tres',753),('setecentos e cincoenta e quatro',754),
  ('setecentos e cinquenta e quatro',754),('setecentos e cincoenta e cinco',755),('setecentos e cinquenta e cinco',755),('setecentos e cincoenta e seis',756),('setecentos e cinquenta e seis',756),('setecentos e cincoenta e sete',757),
  ('setecentos e cinquenta e sete',757),('setecentos e cincoenta e oito',758),('setecentos e cinquenta e oito',758),('setecentos e cincoenta e nove',759),('setecentos e cinquenta e nove',759),('setecentos e sessenta',760),
  ('setecentos e sessenta e um',761),('setecentos e sessenta e uma',761),('setecentos e sessenta e dois',762),('setecentos e sessenta e duas',762),('setecentos e sessenta e tres',763),('setecentos e sessenta e quatro',764),
  ('setecentos e sessenta e cinco',765),('setecentos e sessenta e seis',766),('setecentos e sessenta e sete',767),('setecentos e sessenta e oito',768),('setecentos e sessenta e nove',769),('setecentos e setenta',770),
  ('setecentos e setenta e um',771),('setecentos e setenta e uma',771),('setecentos e setenta e dois',772),('setecentos e setenta e duas',772),('setecentos e setenta e tres',773),('setecentos e setenta e quatro',774),
  ('setecentos e setenta e cinco',775),('setecentos e setenta e seis',776),('setecentos e setenta e sete',777),('setecentos e setenta e oito',778),('setecentos e setenta e nove',779),('setecentos e oitenta',780),
  ('setecentos e oitenta e um',781),('setecentos e oitenta e uma',781),('setecentos e oitenta e dois',782),('setecentos e oitenta e duas',782),('setecentos e oitenta e tres',783),('setecentos e oitenta e quatro',784),
  ('setecentos e oitenta e cinco',785),('setecentos e oitenta e seis',786),('setecentos e oitenta e sete',787),('setecentos e oitenta e oito',788),('setecentos e oitenta e nove',789),('setecentos e noventa',790),
  ('setecentos e noventa e um',791),('setecentos e noventa e uma',791),('setecentos e noventa e dois',792),('setecentos e noventa e duas',792),('setecentos e noventa e tres',793),('setecentos e noventa e quatro',794),
  ('setecentos e noventa e cinco',795),('setecentos e noventa e seis',796),('setecentos e noventa e sete',797),('setecentos e noventa e oito',798),('setecentos e noventa e nove',799),('oitocentos',800),
  ('oitocentos e um',801),('oitocentos e uma',801),('oitocentos e dois',802),('oitocentos e duas',802),('oitocentos e tres',803),('oitocentos e quatro',804),
  ('oitocentos e cinco',805),('oitocentos e seis',806),('oitocentos e sete',807),('oitocentos e oito',808),('oitocentos e nove',809),('oitocentos e dez',810),
  ('oitocentos e onze',811),('oitocentos e doze',812),('oitocentos e treze',813),('oitocentos e catorze',814),('oitocentos e quatorze',814),('oitocentos e quinze',815),
  ('oitocentos e dezasseis',816),('oitocentos e dezesseis',816),('oitocentos e dezassete',817),('oitocentos e dezessete',817),('oitocentos e dezoito',818),('oitocentos e dezanove',819),
  ('oitocentos e dezenove',819),('oitocentos e vinte',820),('oitocentos e vinte e um',821),('oitocentos e vinte e uma',821),('oitocentos e vinte e dois',822),('oitocentos e vinte e duas',822),
  ('oitocentos e vinte e tres',823),('oitocentos e vinte e quatro',824),('oitocentos e vinte e cinco',825),('oitocentos e vinte e seis',826),('oitocentos e vinte e sete',827),('oitocentos e vinte e oito',828),
  ('oitocentos e vinte e nove',829),('oitocentos e trinta',830),('oitocentos e trinta e um',831),('oitocentos e trinta e uma',831),('oitocentos e trinta e dois',832),('oitocentos e trinta e duas',832),
  ('oitocentos e trinta e tres',833),('oitocentos e trinta e quatro',834),('oitocentos e trinta e cinco',835),('oitocentos e trinta e seis',836),('oitocentos e trinta e sete',837),('oitocentos e trinta e oito',838),
  ('oitocentos e trinta e nove',839),('oitocentos e quarenta',840),('oitocentos e quarenta e um',841),('oitocentos e quarenta e uma',841),('oitocentos e quarenta e dois',842),('oitocentos e quarenta e duas',842),
  ('oitocentos e quarenta e tres',843),('oitocentos e quarenta e quatro',844),('oitocentos e quarenta e cinco',845),('oitocentos e quarenta e seis',846),('oitocentos e quarenta e sete',847),('oitocentos e quarenta e oito',848),
  ('oitocentos e quarenta e nove',849),('oitocentos e cincoenta',850),('oitocentos e cinquenta',850),('oitocentos e cincoenta e um',851),('oitocentos e cincoenta e uma',851),('oitocentos e cinquenta e um',851),
  ('oitocentos e cinquenta e uma',851),('oitocentos e cincoenta e dois',852),('oitocentos e cincoenta e duas',852),('oitocentos e cinquenta e dois',852),('oitocentos e cinquenta e duas',852),('oitocentos e cincoenta e tres',853),
  ('oitocentos e cinquenta e tres',853),('oitocentos e cincoenta e quatro',854),('oitocentos e cinquenta e quatro',854),('oitocentos e cincoenta e cinco',855),('oitocentos e cinquenta e cinco',855),('oitocentos e cincoenta e seis',856),
  ('oitocentos e cinquenta e seis',856),('oitocentos e cincoenta e sete',857),('oitocentos e cinquenta e sete',857),('oitocentos e cincoenta e oito',858),('oitocentos e cinquenta e oito',858),('oitocentos e cincoenta e nove',859),
  ('oitocentos e cinquenta e nove',859),('oitocentos e sessenta',860),('oitocentos e sessenta e um',861),('oitocentos e sessenta e uma',861),('oitocentos e sessenta e dois',862),('oitocentos e sessenta e duas',862),
  ('oitocentos e sessenta e tres',863),('oitocentos e sessenta e quatro',864),('oitocentos e sessenta e cinco',865),('oitocentos e sessenta e seis',866),('oitocentos e sessenta e sete',867),('oitocentos e sessenta e oito',868),
  ('oitocentos e sessenta e nove',869),('oitocentos e setenta',870),('oitocentos e setenta e um',871),('oitocentos e setenta e uma',871),('oitocentos e setenta e dois',872),('oitocentos e setenta e duas',872),
  ('oitocentos e setenta e tres',873),('oitocentos e setenta e quatro',874),('oitocentos e setenta e cinco',875),('oitocentos e setenta e seis',876),('oitocentos e setenta e sete',877),('oitocentos e setenta e oito',878),
  ('oitocentos e setenta e nove',879),('oitocentos e oitenta',880),('oitocentos e oitenta e um',881),('oitocentos e oitenta e uma',881),('oitocentos e oitenta e dois',882),('oitocentos e oitenta e duas',882),
  ('oitocentos e oitenta e tres',883),('oitocentos e oitenta e quatro',884),('oitocentos e oitenta e cinco',885),('oitocentos e oitenta e seis',886),('oitocentos e oitenta e sete',887),('oitocentos e oitenta e oito',888),
  ('oitocentos e oitenta e nove',889),('oitocentos e noventa',890),('oitocentos e noventa e um',891),('oitocentos e noventa e uma',891),('oitocentos e noventa e dois',892),('oitocentos e noventa e duas',892),
  ('oitocentos e noventa e tres',893),('oitocentos e noventa e quatro',894),('oitocentos e noventa e cinco',895),('oitocentos e noventa e seis',896),('oitocentos e noventa e sete',897),('oitocentos e noventa e oito',898),
  ('oitocentos e noventa e nove',899),('novecentos',900),('novecentos e um',901),('novecentos e uma',901),('novecentos e dois',902),('novecentos e duas',902),
  ('novecentos e tres',903),('novecentos e quatro',904),('novecentos e cinco',905),('novecentos e seis',906),('novecentos e sete',907),('novecentos e oito',908),
  ('novecentos e nove',909),('novecentos e dez',910),('novecentos e onze',911),('novecentos e doze',912),('novecentos e treze',913),('novecentos e catorze',914),
  ('novecentos e quatorze',914),('novecentos e quinze',915),('novecentos e dezasseis',916),('novecentos e dezesseis',916),('novecentos e dezassete',917),('novecentos e dezessete',917),
  ('novecentos e dezoito',918),('novecentos e dezanove',919),('novecentos e dezenove',919),('novecentos e vinte',920),('novecentos e vinte e um',921),('novecentos e vinte e uma',921),
  ('novecentos e vinte e dois',922),('novecentos e vinte e duas',922),('novecentos e vinte e tres',923),('novecentos e vinte e quatro',924),('novecentos e vinte e cinco',925),('novecentos e vinte e seis',926),
  ('novecentos e vinte e sete',927),('novecentos e vinte e oito',928),('novecentos e vinte e nove',929),('novecentos e trinta',930),('novecentos e trinta e um',931),('novecentos e trinta e uma',931),
  ('novecentos e trinta e dois',932),('novecentos e trinta e duas',932),('novecentos e trinta e tres',933),('novecentos e trinta e quatro',934),('novecentos e trinta e cinco',935),('novecentos e trinta e seis',936),
  ('novecentos e trinta e sete',937),('novecentos e trinta e oito',938),('novecentos e trinta e nove',939),('novecentos e quarenta',940),('novecentos e quarenta e um',941),('novecentos e quarenta e uma',941),
  ('novecentos e quarenta e dois',942),('novecentos e quarenta e duas',942),('novecentos e quarenta e tres',943),('novecentos e quarenta e quatro',944),('novecentos e quarenta e cinco',945),('novecentos e quarenta e seis',946),
  ('novecentos e quarenta e sete',947),('novecentos e quarenta e oito',948),('novecentos e quarenta e nove',949),('novecentos e cincoenta',950),('novecentos e cinquenta',950),('novecentos e cincoenta e um',951),
  ('novecentos e cincoenta e uma',951),('novecentos e cinquenta e um',951),('novecentos e cinquenta e uma',951),('novecentos e cincoenta e dois',952),('novecentos e cincoenta e duas',952),('novecentos e cinquenta e dois',952),
  ('novecentos e cinquenta e duas',952),('novecentos e cincoenta e tres',953),('novecentos e cinquenta e tres',953),('novecentos e cincoenta e quatro',954),('novecentos e cinquenta e quatro',954),('novecentos e cincoenta e cinco',955),
  ('novecentos e cinquenta e cinco',955),('novecentos e cincoenta e seis',956),('novecentos e cinquenta e seis',956),('novecentos e cincoenta e sete',957),('novecentos e cinquenta e sete',957),('novecentos e cincoenta e oito',958),
  ('novecentos e cinquenta e oito',958),('novecentos e cincoenta e nove',959),('novecentos e cinquenta e nove',959),('novecentos e sessenta',960),('novecentos e sessenta e um',961),('novecentos e sessenta e uma',961),
  ('novecentos e sessenta e dois',962),('novecentos e sessenta e duas',962),('novecentos e sessenta e tres',963),('novecentos e sessenta e quatro',964),('novecentos e sessenta e cinco',965),('novecentos e sessenta e seis',966),
  ('novecentos e sessenta e sete',967),('novecentos e sessenta e oito',968),('novecentos e sessenta e nove',969),('novecentos e setenta',970),('novecentos e setenta e um',971),('novecentos e setenta e uma',971),
  ('novecentos e setenta e dois',972),('novecentos e setenta e duas',972),('novecentos e setenta e tres',973),('novecentos e setenta e quatro',974),('novecentos e setenta e cinco',975),('novecentos e setenta e seis',976),
  ('novecentos e setenta e sete',977),('novecentos e setenta e oito',978),('novecentos e setenta e nove',979),('novecentos e oitenta',980),('novecentos e oitenta e um',981),('novecentos e oitenta e uma',981),
  ('novecentos e oitenta e dois',982),('novecentos e oitenta e duas',982),('novecentos e oitenta e tres',983),('novecentos e oitenta e quatro',984),('novecentos e oitenta e cinco',985),('novecentos e oitenta e seis',986),
  ('novecentos e oitenta e sete',987),('novecentos e oitenta e oito',988),('novecentos e oitenta e nove',989),('novecentos e noventa',990),('novecentos e noventa e um',991),('novecentos e noventa e uma',991),
  ('novecentos e noventa e dois',992),('novecentos e noventa e duas',992),('novecentos e noventa e tres',993),('novecentos e noventa e quatro',994),('novecentos e noventa e cinco',995),('novecentos e noventa e seis',996),
  ('novecentos e noventa e sete',997),('novecentos e noventa e oito',998),('novecentos e noventa e nove',999)
ON CONFLICT (palavra) DO NOTHING;
SELECT count(*) AS numerais FROM num_pt;

\echo '### 0b/7 as duas normalizacoes (norm_via espelha normalizeVia do backend)'
CREATE OR REPLACE FUNCTION norm_cidade(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucnyy')),
    '\s+', ' ', 'g'))
$fn$;

CREATE OR REPLACE FUNCTION norm_via(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v text;
BEGIN
  v := btrim(regexp_replace(regexp_replace(lower(translate(coalesce(t,''),
        'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucnyy')),
        '[.,]', ' ', 'g'), '\s+', ' ', 'g'));
  v := CASE
    WHEN v ~ '^(avenida|avd|avn|av)( |$)'    THEN regexp_replace(v, '^(avenida|avd|avn|av)', 'av')
    WHEN v ~ '^(rua|r)( |$)'                 THEN regexp_replace(v, '^(rua|r)', 'rua')
    WHEN v ~ '^(travessa|trav|tv)( |$)'      THEN regexp_replace(v, '^(travessa|trav|tv)', 'travessa')
    WHEN v ~ '^(rodovia|rod)( |$)'           THEN regexp_replace(v, '^(rodovia|rod)', 'rodovia')
    WHEN v ~ '^(estrada|estr|est)( |$)'      THEN regexp_replace(v, '^(estrada|estr|est)', 'estrada')
    WHEN v ~ '^(alameda|al)( |$)'            THEN regexp_replace(v, '^(alameda|al)', 'alameda')
    WHEN v ~ '^(praca|pca|pc)( |$)'          THEN regexp_replace(v, '^(praca|pca|pc)', 'praca')
    ELSE v END;
  RETURN btrim(regexp_replace(v, '\s+', ' ', 'g'));
END $fn$;

-- Numeral por extenso vira DÍGITO, olhando frases de até 5 palavras ("cento e vinte e
-- dois" → "122"). Zero à esquerda cai fora ("rua 08" e "rua 8" são a mesma rua).
CREATE OR REPLACE FUNCTION canon_via(v text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE toks text[]; saida text[] := '{}'; i int := 1; n int; j int; best int; val int; frase text;
BEGIN
  IF v IS NULL OR v = '' THEN RETURN v; END IF;
  v := regexp_replace(v, '(^| )0+([0-9])', '\1\2', 'g');
  toks := string_to_array(v, ' ');
  n := coalesce(array_length(toks,1),0);
  WHILE i <= n LOOP
    best := 0;
    FOR j IN REVERSE least(i+4, n) .. i LOOP
      frase := array_to_string(toks[i:j], ' ');
      SELECT valor INTO val FROM num_pt WHERE palavra = frase;
      IF val IS NOT NULL THEN best := j; EXIT; END IF;
    END LOOP;
    IF best > 0 THEN saida := saida || val::text; i := best + 1;
    ELSE saida := saida || toks[i]; i := i + 1; END IF;
  END LOOP;
  RETURN array_to_string(saida, ' ');
END $fn$;

\echo '### 1/7 (uf, cidade) -> cod_municipio: e por aqui que o cadastro entra'
CREATE TABLE IF NOT EXISTS cnefe_mun_map (uf text NOT NULL, city_norm text NOT NULL, cod_municipio text, PRIMARY KEY (uf, city_norm));
TRUNCATE cnefe_mun_map;
INSERT INTO cnefe_mun_map
SELECT DISTINCT ON (btrim(uf), norm_cidade(municipio)) btrim(uf), norm_cidade(municipio), cod_municipio
FROM cnefe_endereco WHERE municipio IS NOT NULL AND cod_municipio IS NOT NULL
ORDER BY btrim(uf), norm_cidade(municipio), cod_municipio;
SELECT count(*) AS municipios_mapeados FROM cnefe_mun_map;

\echo '### 2/7 dicionario de vias canonicas'
CREATE TABLE IF NOT EXISTS via_canon_dict (logradouro_norm text PRIMARY KEY, via_canon text);
TRUNCATE via_canon_dict;
INSERT INTO via_canon_dict
SELECT logradouro_norm, canon_via(logradouro_norm)
FROM (SELECT DISTINCT logradouro_norm FROM cnefe_endereco WHERE logradouro_norm IS NOT NULL) t;
SELECT count(*) AS vias, count(*) FILTER (WHERE via_canon <> logradouro_norm) AS mudaram FROM via_canon_dict;

\echo '### 3/7 cnefe_porta (municipio+via+numero+bairro) — a tabela que o backend le'
CREATE TABLE IF NOT EXISTS cnefe_porta (
  cod_municipio text, via_canon text, numero int, loc_norm text,
  lat double precision, lng double precision, cep text, n int, spread_m double precision,
  cnefe_nivel smallint,
  PRIMARY KEY (cod_municipio, via_canon, numero, loc_norm)
);
TRUNCATE cnefe_porta;
INSERT INTO cnefe_porta
SELECT e.cod_municipio, d.via_canon, e.numero,
  coalesce(nullif(norm_cidade(e.localidade),''),'-'),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY e.lat),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY e.lng),
  mode() WITHIN GROUP (ORDER BY btrim(e.cep::text)),
  count(*), (max(e.lat)-min(e.lat))*111320 + (max(e.lng)-min(e.lng))*103000,
  min(e.nivel_geo)
FROM cnefe_endereco e JOIN via_canon_dict d ON d.logradouro_norm = e.logradouro_norm
WHERE e.numero IS NOT NULL AND e.lat IS NOT NULL AND e.lng IS NOT NULL
GROUP BY 1,2,3,4;
SELECT count(*) AS portas_com_bairro FROM cnefe_porta;
-- 10/08 — o REVERSO (posição → CEP, `resolverCnefeReverso`) consulta por caixa de
-- lat/lng; sem este índice é seq scan na tabela inteira e estoura o teto de 4 s.
CREATE INDEX IF NOT EXISTS idx_cnefe_porta_lat ON cnefe_porta (lat, lng);

\echo '### 4/7 cnefe_porta_any (municipio+via+numero) = a porta sem o bairro'
CREATE TABLE IF NOT EXISTS cnefe_porta_any (
  cod_municipio text, via_canon text, numero int,
  lat double precision, lng double precision, cep text, n int, spread_m double precision,
  cnefe_nivel smallint,
  PRIMARY KEY (cod_municipio, via_canon, numero)
);
TRUNCATE cnefe_porta_any;
INSERT INTO cnefe_porta_any
SELECT cod_municipio, via_canon, numero,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lat),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lng),
  mode() WITHIN GROUP (ORDER BY cep),
  sum(n)::int, (max(lat)-min(lat))*111320 + (max(lng)-min(lng))*103000, min(cnefe_nivel)
FROM cnefe_porta GROUP BY 1,2,3;
SELECT count(*) AS portas FROM cnefe_porta_any;

\echo '### 5/7 cnefe_via (municipio+via)'
CREATE TABLE IF NOT EXISTS cnefe_via (
  cod_municipio text, via_canon text, lat double precision, lng double precision,
  cep text, n int, spread_m double precision, PRIMARY KEY (cod_municipio, via_canon)
);
TRUNCATE cnefe_via;
INSERT INTO cnefe_via
SELECT e.cod_municipio, d.via_canon,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY e.lat),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY e.lng),
  mode() WITHIN GROUP (ORDER BY btrim(e.cep::text)),
  count(*), (max(e.lat)-min(e.lat))*111320 + (max(e.lng)-min(e.lng))*103000
FROM cnefe_endereco e JOIN via_canon_dict d ON d.logradouro_norm = e.logradouro_norm
WHERE e.lat IS NOT NULL AND e.lng IS NOT NULL
GROUP BY 1,2;
SELECT count(*) AS vias FROM cnefe_via;

\echo '### 6/7 cnefe_bairro (municipio+bairro)'
CREATE TABLE IF NOT EXISTS cnefe_bairro (
  cod_municipio text, loc_norm text, lat double precision, lng double precision,
  n int, spread_m double precision, PRIMARY KEY (cod_municipio, loc_norm)
);
TRUNCATE cnefe_bairro;
INSERT INTO cnefe_bairro
SELECT cod_municipio, coalesce(nullif(norm_cidade(localidade),''),'-'),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lat),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lng),
  count(*), (max(lat)-min(lat))*111320 + (max(lng)-min(lng))*103000
FROM cnefe_endereco WHERE lat IS NOT NULL GROUP BY 1,2;
SELECT count(*) AS bairros FROM cnefe_bairro;

\echo '### 7/7 cnefe_mun (municipio)'
CREATE TABLE IF NOT EXISTS cnefe_mun (
  cod_municipio text PRIMARY KEY, lat double precision, lng double precision,
  n int, spread_m double precision
);
TRUNCATE cnefe_mun;
INSERT INTO cnefe_mun
SELECT cod_municipio,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lat),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lng),
  count(*), (max(lat)-min(lat))*111320 + (max(lng)-min(lng))*103000
FROM cnefe_endereco WHERE lat IS NOT NULL GROUP BY 1;
SELECT count(*) AS municipios FROM cnefe_mun;

\echo '### 8/8 pg_trgm + GIN em cnefe_via.via_canon (busca da parada avulsa, 12/08)'
-- `GET /logistica/busca` (PR12082026) faz fuzzy/prefixo em cnefe_via escopado
-- por cod_municipio (PK). O GIN é o reforço do fuzzy pra município grande.
-- pg_trgm é extensão TRUSTED (PG13+): o dono do banco cria sem superuser.
-- O TRUNCATE lá em cima NÃO derruba índice — recarga de UF mantém este vivo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_cnefe_via_canon_trgm ON cnefe_via USING gin (via_canon gin_trgm_ops);

ANALYZE num_pt; ANALYZE cnefe_mun_map; ANALYZE via_canon_dict; ANALYZE cnefe_porta;
ANALYZE cnefe_porta_any; ANALYZE cnefe_via; ANALYZE cnefe_bairro; ANALYZE cnefe_mun;
SELECT 'tamanho dos agregados' AS x, pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS total
FROM pg_class c WHERE c.relname IN ('via_canon_dict','cnefe_porta','cnefe_porta_any','cnefe_via','cnefe_bairro','cnefe_mun','cnefe_mun_map');
\echo '### AGREGADOS OK'
