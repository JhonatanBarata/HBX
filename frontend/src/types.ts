// src/types.ts

export interface Produto {
  id: number;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  created_at: string;
}

export interface Pedido {
  id: number;
  cliente_nome: string;
  produto_id: number;
  quantidade: number;
  status: string;
  created_at: string;
  produto?: Produto;
}

export interface User {
  id: number;
  email: string;
  createdAt: string;
}

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  border: string;
  logo?: string;
  businessName: string;
  slogan?: string;
}

export interface CartItem {
  produto: Produto;
  quantidade: number;
}

export interface OrderData {
  clienteNome: string;
  items: CartItem[];
  observacoes?: string;
}
