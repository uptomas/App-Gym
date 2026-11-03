# ◆ Iron System

App de ginásio estilo jogo: regista os teus treinos, bate recordes pessoais e sobe de rank. Visual inspirado nas janelas do "Sistema" dos animes de caçadores (azul néon, notificações, níveis e missões).

## Funcionalidades

- **Treinos**: data, nome, peso corporal do dia, exercícios, séries com peso (kg) e repetições. Podes repetir um treino anterior com um toque, e o "Anterior" e o "Recorde" aparecem enquanto registas.
- **Recordes pessoais (PR)**
  - `▲ PR PESO`: a série mais pesada do treino supera o teu maior peso de sempre nesse exercício.
  - `◆ PR VOLUME`: a melhor série (peso × reps) supera o teu maior volume numa só série.
  - Os PRs acendem em tempo real enquanto escreves e aparecem no histórico, no feed e numa notificação do Sistema.
- **Ranking em ligas**: Bronze → Prata → Ouro → Platina → Diamante → Campeão → Grande Campeão (cada um com I, II e III) → Lenda.
  - Por exercício: 1RM estimado (Epley) ÷ peso corporal desse dia, comparado com normas de força (iniciante → elite) e convertido em MMR.
  - **Mapa muscular** (frente e costas): cada músculo (peito, costas, ombros, bíceps, tríceps, quadríceps, posteriores, glúteos, gémeos, abdominais) fica com o rank do teu melhor exercício para ele e é pintado com a cor da liga.
  - Rank geral = média dos 8 músculos principais. Os músculos que não treinas contam 0, por isso um físico equilibrado sobe mais. Saís da qualificação com 4 músculos com rank.
  - Mostra quanto 1RM te falta para a próxima divisão.
  - Há normas masculinas e femininas (escolhes no Perfil).
- **Progressão RPG**: EXP por treino (volume + bónus por PR), níveis, títulos, atributos (Força, Vitalidade, Resistência, Disciplina), missão diária e semanal, sequência de semanas a treinar.
- **Recordes por exercício**: maior peso, maior volume por série, 1RM estimado, gráfico da evolução e histórico.
- **Temporizador de descanso** que arranca sozinho quando registas as reps de uma série (±15 s, vibra no fim; duração no Perfil).
- Exercícios personalizados, exportar/importar cópia em JSON, dados de exemplo.
- PWA: funciona offline e pode ser instalada no telemóvel ("Adicionar ao ecrã principal").

## Usar

Não há build nem dependências. Abre o `index.html` no navegador, ou serve a pasta:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

Para a usar no telemóvel, publica com **GitHub Pages** (Settings → Pages → Deploy from branch) e adiciona-a ao ecrã principal.

> Os dados ficam guardados no `localStorage` do navegador, apenas nesse dispositivo. Usa "Exportar cópia" no Perfil para fazer backups.

## Ficheiros

- `index.html`: estrutura
- `styles.css`: tema visual
- `app.js`: lógica (treinos, PRs, XP, ranking, emblemas SVG)
- `sw.js` e `manifest.webmanifest`: suporte offline / instalação
