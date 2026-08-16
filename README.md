# 🚀 Sistema de Gestão de Entregas Integrado à DeliveryVip (API Merchant V3)

Sistema Web e Mobile-First completo para gerenciamento de pedidos e entregadores, integrado de forma resiliente à API Merchant V3 da DeliveryVip.

---

## 🏛️ Arquitetura do Sistema

```text
               DELIVERYVIP (Plataforma Externa)
                             |
                             | API Merchant V3 (OAuth 2.0 / Polling 30s)
                             v
               +---------------------------+
               | NOSSO BACKEND (Express)   |
               | & Polling Worker          |
               +---------------------------+
                             |
         +-------------------+-------------------+
         | (JWT Auth)                            | (JWT Auth)
         v                                       v
PAINEL ADMIN / OPERADOR                  APP ENTREGADOR (Mobile)
(React + Tailwind CSS)                   (React Mobile-First)
```

### Regras de Segurança Implementadas:
- 🔒 **Isolamento de Credenciais**: O frontend NUNCA acessa diretamente a API da DeliveryVip e NUNCA recebe `client_secret` ou `access_token`.
- 🔑 **Criptografia AES-256-GCM**: As credenciais dos Merchants são armazenadas com criptografia forte no banco de dados.
- 🔁 **Deduplicação de Eventos**: Restrição `UNIQUE(event_id)` no banco de dados para garantir que eventos duplicados enviados pela DeliveryVip nunca sejam processados duas vezes.
- 💬 **Política de ACK Idempotente**: Envio de Acknowledgment para TODOS os eventos tratados (incluindo duplicados), após gravação/processamento local.
- 📋 **Consulta Prévia Obrigatória**: No recebimento do evento `CREATED`, o sistema realiza obrigatoriamente a consulta dos detalhes (`/merchant/v3/orders/{orderId}`) antes de efetuar a confirmação.

---

## 📁 Estrutura de Diretórios do Projeto

```text
deliveryvip-system/
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Modelagem de dados PostgreSQL (15+ tabelas)
│   │   └── seed.ts             # Dados de teste (Admin, Operador, Entregador, Merchant)
│   ├── src/
│   │   ├── common/             # Utilitários (AES-256 Crypto, JWT, Logger Sanitizado)
│   │   ├── config/             # Módulo de variáveis de ambiente
│   │   ├── db/                 # Instância compartilhada do PrismaClient
│   │   ├── deliveryvip/        # TokenManager OAuth 2.0, DeliveryVipClient & EventProcessor
│   │   ├── middleware/         # Autenticação JWT e RBAC (ADMIN, OPERATOR, DELIVERY_PERSON)
│   │   ├── orders/             # Máquina de estados estrita (OrderStateMachine)
│   │   ├── routes/             # Endpoints REST (Auth, Merchants, Orders, Drivers, Dashboard)
│   │   ├── worker/             # DeliveryVip Polling Worker autônomo
│   │   ├── app.ts              # Aplicação Express com middleware global de erro (Seção 61)
│   │   └── index.ts            # Ponto de entrada do servidor API
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/         # Navbar, Sidebar, Modais e Componentes Reutilizáveis
│   │   ├── context/            # Contexto de Autenticação React (AuthContext)
│   │   ├── pages/              # Painel Admin (Dashboard, Orders, Drivers, Settings) & App Entregador
│   │   ├── services/           # Cliente Axios configurado (api.ts)
│   │   ├── types/              # Interfaces TypeScript unificadas
│   │   ├── App.tsx             # Roteamento e Proteção de Acesso por Função
│   │   └── main.tsx
│   ├── index.html
│   ├── Dockerfile
│   └── package.json
│
├── mock-deliveryvip/
│   ├── index.js                # Servidor Express simulando API Merchant V3 DeliveryVip
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
└── README.md
```

---

## ⚡ Como Executar o Projeto

### Opção 1: Via Docker Compose (Recomendado)

Suba toda a infraestrutura com um único comando:

```bash
docker-compose up --build
```

Serviços disponíveis:
- **Painel Admin Web**: http://localhost (Porta 80)
- **Backend API**: http://localhost:3000
- **Servidor Mock DeliveryVip**: http://localhost:3001
- **Banco PostgreSQL**: `localhost:5432`

---

### Opção 2: Execução Local para Desenvolvimento

#### 1. Iniciar o Servidor Mock da DeliveryVip:
```bash
cd mock-deliveryvip
npm install
npm start
```

#### 2. Configurar e Iniciar o Backend:
```bash
cd backend
npm install
npx prisma generate
npm run dev
```

Em um novo terminal, inicie o **Worker de Polling**:
```bash
cd backend
npm run worker
```

#### 3. Iniciar o Frontend Web:
```bash
cd frontend
npm install
npm run dev
```
Acesse o painel web em `http://localhost:5173`.

---

## 🔑 Credenciais de Teste Pré-Cadastradas (Seeding)

As seguintes contas padrão já estão prontas para uso (Senha padrão: `123456`):

| Perfil | E-mail | Função |
| :--- | :--- | :--- |
| **Administrador** | `admin@deliveryvip.com` | Acesso total ao painel, entregadores e configurações |
| **Operador** | `operador@deliveryvip.com` | Gestão de pedidos, atribuições e status da cozinha |
| **Entregador** | `entregador@deliveryvip.com` | Redirecionado automaticamente para a interface mobile do entregador |

---

## 🛵 Fluxo Completo do Entregador (App Mobile-First)

1. Faça login como entregador (`entregador@deliveryvip.com`).
2. Mantenha seu status como **DISPONÍVEL**.
3. No painel de administração/operador, atribua um pedido ao entregador João.
4. O entregador visualizará o card do pedido com o fluxo guiado por botões dinâmicos:
   - `ACEITAR PEDIDO`
   - `IR PARA O ESTABELECIMENTO` (dispara evento de tracking `PICKUP_ONGOING`)
   - `CHEGUEI NO ESTABELECIMENTO` (dispara evento de tracking `ARRIVED_AT_MERCHANT`)
   - `PEDIDO RETIRADO` (dispara evento de tracking `DELIVERY_ONGOING`)
   - `CHEGUEI NO CLIENTE` (dispara evento de tracking `ARRIVED_AT_CUSTOMER`)
   - `CONFIRMAR ENTREGA` (dispara evento de tracking `ORDER_DELIVERED` e atualiza a DeliveryVip via endpoint `/delivered`).
