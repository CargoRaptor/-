
export interface TNVEDCode {
  code: string;
  name: string;
  description: string;
  category: string;
  importDuty: number; // Процент
  minDutyAmount?: number; // Минимальная сумма (например, 1)
  minDutyCurrency?: Currency; // Валюта минимума (например, EUR)
  vat: number; // Процент
  excise?: number; // Опционально процент
  measureUnit: string;
}

export type ShippingMethod = 'Sea' | 'Rail' | 'Road' | 'Air';
export type Currency = 'USD' | 'CNY' | 'EUR' | 'RUB';

export interface ExchangeRates {
  USD: number;
  CNY: number;
  EUR: number;
  date: string;
}

export interface CalculationResult {
  productValue: number;
  insuranceAmount: number;
  totalCustomsValue: number;
  importDutyAmount: number;
  vatAmount: number;
  exciseAmount: number;
  totalTaxes: number;
  bankCommission: number;
  shippingCost: number; 
  localServices: number; 
  grandTotal: number;
}
