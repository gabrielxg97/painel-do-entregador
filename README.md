# 🛵 CompetiLivery — Painel do Entregador & Frota PWA

Aplicação Web PWA moderna, responsiva e em tempo real para controle de entregas, navegação por GPS (Google Maps & Waze), contato direto via WhatsApp e notificação inteligente de troco para a frota de motoboys da **CompetiLivery**.

---

## ✨ Funcionalidades Principais

- **📋 Quadro Kanban 2 Colunas**:
  - 🛵 **Em Entrega**: Pedidos atribuídos ao motoboy em tempo real.
  - ✅ **Finalizados**: Histórico de entregas concluídas retidas por **12 horas** com expiração automática.
- **📱 PWA Instalável no Celular**:
  - Notificação de instalação com 1 toque para adicionar o App diretamente na tela inicial do celular (Android & iOS).
- **⏱️ Monitoramento de Tempo & Alerta de Atraso**:
  - Alerta dinâmico avisando com **10 minutos de antecedência** se a entrega estiver próxima do horário limite.
  - Alerta pulsante em vermelho para pedidos atrasados.
- **💵 Detecção Inteligente de Troco**:
  - Leitura recursiva profunda de pagamentos em dinheiro com cálculo do troco a ser devolvido e **Banner de Atenção Visual**.
- **📍 Navegação Dupla por GPS**:
  - Botões com coordenadas diretas para abrir rota no **Google Maps** ou no **Waze**.
- **💬 Contato WhatsApp Instantâneo**:
  - Botão com ícone oficial do WhatsApp contendo mensagem padrão de chegada ao endereço.
- **👤 Identificação Persistente**:
  - Modal de cadastro no 1º acesso no celular com salvamento contínuo em `localStorage`.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar as dependências do Node.js
npm install

# 2. Iniciar o servidor
node server.js
```

Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

---

## 📌 Repositório Oficial
- **GitHub**: [https://github.com/gabrielxg97/Painel-do-entregador](https://github.com/gabrielxg97/Painel-do-entregador)
