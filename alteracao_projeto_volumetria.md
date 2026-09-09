# Alteração de Projeto - Dashboard de Volumetria e Custos

## 1. Objetivo

Implementar/ajustar o projeto para disponibilizar uma visão consolidada
de **volumetria de mensagens, custos atuais e projeções**, permitindo o
acompanhamento histórico e mensal da operação.

A solução deverá contemplar filtros, indicadores, histórico de consumo e
aplicação das regras de precificação definidas para o projeto.

------------------------------------------------------------------------

## 2. Escopo da Alteração

### 2.1. Volumetria de mensagens

Adicionar uma seção de volumetria contendo:

-   **Total de mensagens enviadas**
-   **Total de mensagens recebidas**
-   Consolidação da volumetria por período
-   Separação entre mensagens enviadas e recebidas para análise

### 2.2. Base histórica

Utilizar a base histórica para composição dos indicadores e cálculos de
custo.

A volumetria deverá considerar, no mínimo:

-   Campanhas
-   Mensagens
-   Histórico mensal de consumo

Os valores unitários deverão seguir as regras de precificação vigentes
no projeto.

### 2.3. Filtros

Disponibilizar filtros para permitir o recorte dos dados apresentados.

#### Filtro por conexão

Opções:

-   Conexão 1
-   Conexão 0
-   Todas as conexões

#### Tipo de WhatsApp

Considerar a diferenciação entre:

-   Standard
-   Oficial (WABA)

Os filtros selecionados deverão refletir nos indicadores, custos,
projeções e gráficos apresentados.

------------------------------------------------------------------------

## 3. Indicadores

Criar indicadores de acompanhamento mensal contendo:

### Este mês

-   **Custo atual**
-   **Mensagens enviadas - total**
-   **Mensagens enviadas**
-   **Mensagens recebidas**

### Estimativa deste mês

-   **Custo estimado**
-   Projeção da volumetria para o fechamento do mês
-   Projeção do custo para o fechamento do mês

Os indicadores deverão ser atualizados conforme os filtros selecionados.

------------------------------------------------------------------------

## 4. Histórico e Projeção

Disponibilizar um gráfico com a evolução mensal da volumetria.

O gráfico deverá apresentar:

-   Histórico dos meses anteriores
-   Mês atual
-   Projeção do mês atual
-   Comparativo entre volumetria realizada e projetada

### Tabela mensal

Criar uma tabela contendo, no mínimo:

  Mês     Volume Atual   Projeção
  ----- -------------- ----------
  Jan               \-         \-
  Fev               \-         \-
  Mar               \-         \-
  Abr               \-         \-
  Mai               \-         \-
  Jun               \-         \-
  Jul               \-         \-
  Ago               \-         \-

> A estrutura deverá permitir a continuidade dos meses e a atualização
> automática dos valores.

------------------------------------------------------------------------

## 5. Regras de Precificação

A aplicação dos custos deverá respeitar as regras de precificação
definidas para o projeto.

### Premissas

-   Considerar a volumetria efetivamente enviada e recebida.
-   Aplicar a tarifação correspondente ao tipo de mensagem/conexão.
-   Diferenciar mensagens relacionadas a campanhas quando aplicável.
-   Utilizar os valores unitários definidos na regra comercial vigente.
-   O cálculo do custo estimado deverá utilizar a volumetria já
    realizada e a projeção para o restante do período.

### Fórmula

A lógica de cálculo deverá seguir a estrutura de:

``` text
Custo = Volumetria × Valor unitário
```

Quando houver diferentes categorias de mensagens ou tarifas, o custo
deverá ser calculado individualmente por categoria e posteriormente
consolidado.

------------------------------------------------------------------------

## 6. Projeção do Mês

A estimativa mensal deverá considerar o comportamento da volumetria no
período já transcorrido.

A projeção deverá permitir:

1.  Identificar o volume acumulado no mês.
2.  Calcular a média de consumo do período.
3.  Estimar o volume até o encerramento do mês.
4.  Aplicar a regra de precificação sobre o volume projetado.
5.  Exibir o **custo estimado do mês**.

A projeção deverá ser recalculada conforme os filtros selecionados.

------------------------------------------------------------------------

## 7. Critérios de Aceite

-   [ ] Exibir total de mensagens enviadas.
-   [ ] Exibir total de mensagens recebidas.
-   [ ] Disponibilizar filtro por conexão.
-   [ ] Disponibilizar filtro entre Standard e Oficial (WABA).
-   [ ] Exibir custo atual do mês.
-   [ ] Exibir custo estimado do mês.
-   [ ] Exibir histórico mensal.
-   [ ] Exibir projeção do mês atual.
-   [ ] Separar visualmente mensagens enviadas e recebidas.
-   [ ] Aplicar corretamente as regras de precificação.
-   [ ] Atualizar os indicadores de acordo com os filtros.
-   [ ] Atualizar gráfico e tabela conforme os filtros.
-   [ ] Garantir que a projeção seja calculada automaticamente.

------------------------------------------------------------------------

## 8. Resultado Esperado

Ao final da alteração, o projeto deverá disponibilizar uma visão única
para acompanhamento de **volumetria, custos e projeções**, permitindo
comparar o consumo atual com o histórico e estimar o custo de fechamento
do mês.

A estrutura deverá facilitar a identificação de variações de consumo e
fornecer uma base para acompanhamento das metas e regras de
precificação.
