/** Educational copy shared by guided and custom setup. Values are examples, never forecasts. */
export type RuleGuide = { explanation: string; formula: string; example: string };
const guides: Record<string, RuleGuide> = {
  capital: {
    explanation:
      "Limita o capital disponível para este robô. A reserva de gás fica separada. Não é uma promessa de perda máxima.",
    formula: "Soma das compras previstas ≤ capital disponível",
    example: "Capital de 0,01 BNB permite cinco compras de 0,002 BNB, antes da reserva de gás.",
  },
  buyAmount: {
    explanation:
      "Valor de cada entrada. Confira a unidade: BNB ou percentual do saldo disponível. Comprar novamente aumenta a exposição.",
    formula: "Quantidade recebida ≈ valor da compra ÷ preço, descontados os custos",
    example:
      "Com 100 unidades da moeda de pagamento e preço 2, recebe aproximadamente 50 tokens antes das taxas.",
  },
  maxEntries: {
    explanation:
      "Limita quantas compras podem compor uma posição. Cada nova compra precisa cumprir todos os outros critérios.",
    formula: "Compras executadas na posição < máximo de entradas",
    example: "Máximo 2: depois da segunda entrada, espera as regras de saída.",
  },
  dropPct: {
    explanation:
      "Espera uma queda da referência escolhida. Nas estratégias que permitem recompras, a regra por queda também usa a última compra; uma queda no gráfico sozinha não garante uma entrada.",
    formula:
      "Gatilho = referência × (1 − queda/100). Recompra usa a menor entre referência e última compra.",
    example:
      "Referência 100 e queda de 5%: gatilho 95. Última compra 95: próximo gatilho pode ser 90,25.",
  },
  profitPct: {
    explanation:
      "Meta desejada, não rentabilidade prometida. No modo guiado, considera taxas do token; gás, DEX, slippage e impacto ainda podem reduzir o resultado.",
    formula:
      "Alta para meta após taxas do token = [(1 + meta/100) ÷ ((1 − taxaCompra/100) × (1 − taxaVenda/100)) − 1] × 100",
    example:
      "Com taxa de 8% na compra e 8% na venda, até empatar exige aproximadamente 18,15% de alta antes dos demais custos.",
  },
  stopPct: {
    explanation:
      "Escolha se deseja vender após uma perda ou manter os tokens sem este gatilho. Com stop, a venda pode realizar prejuízo maior devido aos custos. Sem stop, a queda pode continuar até perda total; não há garantia de recuperação. Outras saídas continuam ativas.",
    formula: "Stop por preço = preço médio × (1 − stop/100). Zero desativa somente este stop.",
    example: "Preço médio 100 e stop 8%: tenta vender em 92. A execução pode ocorrer abaixo disso.",
  },
  stopNet: {
    explanation:
      "Estima a perda incluindo taxas do token; não inclui gás, DEX, slippage ou impacto. Pode disparar antes de uma queda equivalente do preço. Zero desativa somente este stop.",
    formula:
      "Preço do stop = preço médio × (1 − limite/100) ÷ ((1 − taxaCompra/100) × (1 − taxaVenda/100))",
    example:
      "Se as taxas por si só já superarem o limite de perda, este stop pode disparar na primeira avaliação após comprar.",
  },
  reserve: {
    explanation:
      "BNB separado para custos futuros de rede. Não é uma cobrança fixa nem uma estimativa exata de gás.",
    formula: "Saldo líquido para compras = BNB disponível − reservas e compromissos aplicáveis",
    example: "Uma venda também precisa de BNB para gás, mesmo que o saldo do token seja positivo.",
  },
  lower: {
    explanation:
      "Limite inferior da grade em BNB por token. Fora da faixa não há novas operações normais da grade; proteções de saída podem continuar.",
    formula: "Limite inferior < limite superior",
    example: "Faixa 0,001 a 0,002 BNB por token. O equivalente em reais varia com o BNB.",
  },
  upper: {
    explanation:
      "Limite superior da faixa da grade. Precisa ser maior que o inferior; faixa estreita pode não pagar os custos.",
    formula: "Espaçamento = (máximo − mínimo) ÷ intervalos",
    example: "De 100 a 120 em 4 intervalos: distância de 5 entre níveis.",
  },
  levels: {
    explanation:
      "Divide a faixa em intervalos. Mais intervalos aproximam os níveis e reduzem a margem bruta por movimento.",
    formula: "Nível i = mínimo + i × (máximo − mínimo) ÷ intervalos",
    example: "Lucro de grade realizado pode coexistir com prejuízo nos tokens ainda mantidos.",
  },
  reboundPct: {
    explanation:
      "Exige recuperação desde a mínima observada após a queda. Usa confirmações por velas fechadas; não prevê o fundo.",
    formula: "Recuperação = (preço ÷ mínima − 1) × 100",
    example: "Mínima 80 e recuperação de 2%: referência de confirmação 81,60.",
  },
  maxReboundPct: {
    explanation: "Evita entrar depois que a recuperação já passou do limite escolhido.",
    formula: "Recuperação mínima ≤ recuperação observada ≤ recuperação máxima",
    example: "Janela de 2% a 5%: acima de 5% não entra por este sinal.",
  },
  confirmationBars: {
    explanation:
      "Número de fechamentos consecutivos em alta necessários para confirmar a recuperação. A vela atual incompleta não confirma o sinal.",
    formula: "Contagem de fechamentos em alta consecutivos ≥ valor escolhido",
    example:
      "Duas confirmações em velas de 15 minutos exigem dois fechamentos válidos, não dois segundos.",
  },
  buyTax: {
    explanation:
      "Taxa cobrada pelo token ao comprar, diferente do gás e da taxa da DEX. Uma medição é uma estimativa das condições consultadas, não garantia permanente.",
    formula: "Tokens após taxa ≈ tokens brutos × (1 − taxaCompra/100)",
    example: "100 tokens brutos com taxa de 8% resultam em aproximadamente 92 tokens.",
  },
  sellTax: {
    explanation:
      "Taxa do token ao vender. Pode exigir uma alta maior para recuperar o custo da compra. Informar zero não comprova ausência de taxa.",
    formula: "Recebimento após taxa ≈ recebimento bruto × (1 − taxaVenda/100)",
    example: "Venda bruta 100 com taxa de 8% deixa aproximadamente 92 antes de outros custos.",
  },
  minLiquidityUsd: {
    explanation:
      "Dinheiro disponível no pool, não seu saldo. Abaixo do piso, bloqueia novas entradas; isso não garante que uma venda futura terá liquidez.",
    formula: "Liquidez consultada ≥ piso configurado",
    example: "Pouca liquidez aumenta impacto de preço e pode dificultar vender.",
  },
  maxGasGwei: {
    explanation:
      "Teto do preço de gás por unidade, diferente da reserva total em BNB. Pode impedir execução se a rede estiver mais cara.",
    formula: "Custo de gás em BNB = unidades de gás × preço em gwei ÷ 1.000.000.000",
    example: "A taxa efetiva depende da transação e da rede.",
  },
  cooldownMin: {
    explanation:
      "Espera mínima para novas entradas. Saídas de proteção continuam sendo avaliadas; uma queda pode ocorrer durante a espera.",
    formula: "Tempo desde última operação ≥ intervalo × 60 segundos",
    example:
      "Intervalo 60 minutos: não faz uma segunda compra cinco minutos depois só porque o preço caiu.",
  },
  maxTradesPerDay: {
    explanation:
      "Ao atingir o número diário de operações contabilizadas, impede novas compras. As saídas da posição continuam.",
    formula: "Operações do dia < limite para autorizar nova compra",
    example: "Atingir o limite não desliga o monitoramento das saídas.",
  },
  maFast: {
    explanation:
      "Média simples de poucas velas fechadas. No modo de tendência, precisa estar acima da média lenta, junto com o recuo e os demais critérios.",
    formula: "SMA(n) = soma dos últimos n fechamentos ÷ n",
    example: "Média rápida acima da lenta é uma condição, não previsão de alta.",
  },
  maSlow: {
    explanation:
      "Média de mais velas fechadas; funciona como referência do recuo no modo de tendência.",
    formula: "SMA(n) = soma dos últimos n fechamentos ÷ n",
    example: "O preço pode continuar caindo mesmo depois de tocar a média.",
  },
  windowHours: {
    explanation: "Janela de histórico usada para formar a referência automática da queda.",
    formula: "Referência calculada sobre observações válidas dentro da janela",
    example: "24 horas não significa comprar obrigatoriamente uma vez por dia.",
  },
  manualReference: {
    explanation:
      "Preço definido por você na moeda do par. Não confunda com reais ou dólares exibidos como conversão.",
    formula: "Gatilho = preço de referência × (1 − queda/100)",
    example: "O campo deve usar a mesma unidade da regra de execução.",
  },
  takeProfit: {
    explanation:
      "Alta do preço sobre o preço médio que dispara uma venda. Em regras manuais, este percentual é a alta bruta do preço; confira os custos separadamente.",
    formula: "Preço-alvo = preço médio × (1 + alta/100)",
    example: "Uma alta de 10% pode não cobrir taxas de compra e venda de 8% cada.",
  },
  sellPct: {
    explanation:
      "Parte do saldo remanescente da posição vendida nesse alvo, uma vez por ciclo nas regras v2.",
    formula: "Quantidade a vender = saldo remanescente × percentual/100",
    example: "Vender 50% e depois 50% do restante deixa 25% da quantidade inicial.",
  },
  maxExposureQuote: {
    explanation:
      "Teto de exposição na moeda do par. O robô ainda depende do saldo líquido e das reservas.",
    formula: "Custo da posição + nova compra ≤ teto de exposição",
    example: "Este teto não garante um limite de perda em reais.",
  },
  allocationBnb: {
    explanation:
      "Capital máximo destinado ao robô, em BNB. Compartilhar uma carteira não multiplica o saldo disponível.",
    formula: "Reservas dos bots respeitam o capital disponível da carteira",
    example: "Dois bots não podem gastar simultaneamente o mesmo BNB reservado.",
  },
  dailyLossLimit: {
    explanation:
      "Limite de perda diária contabilizada que bloqueia novas entradas. Não é uma liquidação automática nem impede perdas maiores na posição aberta.",
    formula: "Perda diária contabilizada comparada ao limite configurado",
    example: "Zero desativa este limite; saídas continuam sendo avaliadas.",
  },
  maxSlippagePct: {
    explanation:
      "Tolerância entre cotação e execução, não rendimento esperado. Aumentar permite receber menos numa execução desfavorável.",
    formula: "Recebimento mínimo considera cotação, taxas aplicáveis e tolerância de slippage",
    example: "Uma cotação pode expirar ou falhar mesmo com tolerância configurada.",
  },
  maxPriceImpactPct: {
    explanation: "Limite para o efeito da própria ordem sobre o preço do pool.",
    formula: "Impacto estimado da ordem ≤ limite configurado",
    example: "Uma ordem grande num pool pequeno pode ser bloqueada.",
  },
  trailingActivatePct: {
    explanation:
      "Valorização que ativa o acompanhamento da máxima. Não garante lucro líquido na venda.",
    formula: "Ativa quando (preço ÷ preço médio − 1) × 100 ≥ ativação",
    example: "Após ativar, o gatilho passa a acompanhar a máxima observada.",
  },
  trailingDistancePct: {
    explanation:
      "Queda da máxima acompanhada que dispara o stop móvel. Desativar o stop fixo não desativa este mecanismo.",
    formula: "Gatilho móvel = máxima após ativação × (1 − distância/100)",
    example: "Máxima 120 e distância 5%: tenta vender em 114, sujeito à execução e custos.",
  },
};
export function ruleGuide(key: string): RuleGuide {
  return (
    guides[key] ?? {
      explanation:
        "Ajusta esta condição da estratégia. Todos os critérios de entrada e saída precisam respeitar o saldo, os custos e os limites da execução.",
      formula: "Valor configurado comparado à condição observada pelo robô",
      example: "Configurar uma condição não garante que uma ordem será executada.",
    }
  );
}
export const manualRuleKey: Record<string, string> = {
  "Queda que dispara a compra (%)": "dropPct",
  "Preço de referência (moeda do par)": "manualReference",
  "Janela da máxima (horas)": "windowHours",
  "Janela (horas)": "windowHours",
  "Valor por compra (BNB)": "buyAmount",
  "Saldo disponível por compra (%)": "buyAmount",
  "Máximo de compras por posição": "maxEntries",
  "Capital máximo deste robô (BNB)": "allocationBnb",
  "Máximo aplicado na posição (BNB)": "maxExposureQuote",
  "Média rápida (velas)": "maFast",
  "Média lenta (velas)": "maSlow",
  "Liquidez mínima (US$)": "minLiquidityUsd",
  "Intervalo mínimo entre compras (min)": "cooldownMin",
  "Máx. operações por dia": "maxTradesPerDay",
  "Reserva do robô (BNB)": "reserve",
  "Limite de perda líquida (%)": "stopNet",
  "Limite de queda do preço (%)": "stopPct",
  "% do saldo remanescente vendido": "sellPct",
  "Limite de perda diária (moeda do par)": "dailyLossLimit",
  "Slippage máximo (%)": "maxSlippagePct",
  "Impacto de preço máximo (%)": "maxPriceImpactPct",
  "Gas máximo (gwei)": "maxGasGwei",
  "Lucro para ativar (%)": "trailingActivatePct",
  "Distância da máxima (%)": "trailingDistancePct",
  "Queda mínima (%)": "dropPct",
  "Recuperação mínima desde o fundo (%)": "reboundPct",
  "Recuperação máxima para entrar (%)": "maxReboundPct",
  "Fechamentos consecutivos em alta": "confirmationBars",
  "Meta líquida mínima estimada (%)": "profitPct",
};
