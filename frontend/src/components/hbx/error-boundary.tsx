"use client";

// ============================================================================
// CERCA DE ENFEITE — a segunda tranca do que é decoração.
//
// O app tem UMA barreira de erro hoje: app/(app)/error.tsx, do Next. Ela é a
// certa para a TELA — crash montando o /vendas vira popup em vez de tela
// branca. Mas ela pega a rota inteira, e é aí que mora o defeito: em React,
// qualquer erro de render sobe até a barreira MAIS PRÓXIMA. Se o único
// anteparo é o da rota, um enfeite de canto tem o mesmo poder de destruição
// que o miolo da tela.
//
// Foi o que aconteceu em 01/08/2026: o painel decorativo do menu lateral
// (costas-panel) recebeu uma resposta pela metade, estourou um TypeError e
// levou a /vendas junto — a tela que dá dinheiro derrubada por um gráfico
// que ninguém pode nem clicar.
//
// A regra que fica: TODO pedaço de tela que é enfeite — painel decorativo,
// widget de canto, gráfico ambiente — mora dentro desta cerca. Ele pode
// sumir; a tela em volta, não. E o sumiço é SILENCIOSO de propósito: enfeite
// que falha não merece popup, porque o usuário não perdeu nada que ele tenha
// pedido. O defeito vai para o console, onde é problema nosso, não dele.
//
// O que NÃO vai aqui dentro: qualquer coisa que o usuário use pra trabalhar.
// Formulário, lista, botão de ação. Se sumir em silêncio for pior do que
// avisar, o lugar é a barreira da rota — não esta.
// ============================================================================

import React from "react";

type Props = {
  children: React.ReactNode;
  /**
   * Muda o valor e a cerca se levanta de novo. Sem isto, um painel que quebrou
   * uma vez ficaria morto até o F5 — inclusive nos OUTROS módulos, que talvez
   * nem tivessem defeito nenhum. Passe aqui o que identifica o conteúdo (o
   * módulo, o id do registro).
   */
  resetKey?: string;
  /** Nome no log. Sem ele o console diz "algo quebrou" e não ajuda ninguém. */
  nome?: string;
};

type Estado = { caiu: boolean; chave?: string };

export class CercaDeEnfeite extends React.Component<Props, Estado> {
  state: Estado = { caiu: false, chave: this.props.resetKey };

  static getDerivedStateFromError(): Partial<Estado> {
    return { caiu: true };
  }

  /**
   * Reset DERIVADO da prop, no próprio render — não num efeito. Trocar de
   * módulo tem que reerguer a cerca no MESMO quadro; um efeito só rodaria
   * depois de pintar, e o painel novo piscaria vazio antes de tentar nascer.
   */
  static getDerivedStateFromProps(props: Props, estado: Estado): Partial<Estado> | null {
    if (props.resetKey !== estado.chave) return { caiu: false, chave: props.resetKey };
    return null;
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    // Console, nunca o barramento de erro (lib/error-bus): o popup central é
    // para falha que ATRAPALHA o usuário. Enfeite quebrado não atrapalha —
    // avisar aqui viraria exatamente o alarme falso que esta cerca existe
    // para calar.
    console.error(
      `[cerca de enfeite] ${this.props.nome ?? "bloco decorativo"} caiu e foi escondido:`,
      erro,
      info.componentStack,
    );
  }

  render() {
    return this.state.caiu ? null : this.props.children;
  }
}
