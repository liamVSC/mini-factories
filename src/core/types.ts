export const TYPES = [
  { name: 'Steel', kind: 'factory', need: null, color: '#8bd5ff', price: 24, speed: .84, value: 1.08, qty: 1.25 },
  { name: 'Food', kind: 'factory', need: null, color: '#a7e66f', price: 18, speed: 1.28, value: .96, qty: .85 },
  { name: 'Parts', kind: 'factory', need: null, color: '#c5a7ff', price: 30, speed: .72, value: 1.25, qty: 1 },
  { name: 'Plastics', kind: 'factory', need: null, color: '#f6a6ff', price: 38, speed: .62, value: 1.42, qty: 1.1, unlock: 'industry', unlockLevel: 1 },
  { name: 'Glass', kind: 'factory', need: null, color: '#7ee7e7', price: 44, speed: .55, value: 1.55, qty: .95, unlock: 'industry', unlockLevel: 2 },
  { name: 'Market', kind: 'shop', need: 'Food', color: '#ffd166', icon: 'M', role: 'Food retailer', desc: 'Sells food to local customers.' },
  { name: 'Garage', kind: 'shop', need: 'Parts', color: '#ff8f8f', icon: 'G', role: 'Vehicle service', desc: 'Consumes parts for repairs.' },
  { name: 'Builder', kind: 'shop', need: 'Steel', color: '#f4a261', icon: 'B', role: 'Construction supply', desc: 'Consumes steel for building jobs.' },
  { name: 'Electronics', kind: 'shop', need: 'Plastics', color: '#d6a8ff', icon: 'E', role: 'Electronics retailer', desc: 'Consumes plastics for electronics demand.', unlock: 'industry', unlockLevel: 1 },
  { name: 'Furniture', kind: 'shop', need: 'Glass', color: '#90d9b4', icon: 'F', role: 'Furniture retailer', desc: 'Consumes glass for furniture demand.', unlock: 'industry', unlockLevel: 2 },
  { name: 'Warehouse', kind: 'warehouse', need: null, color: '#e9c46a', icon: 'W', role: 'Storage hub', desc: 'Stores goods and connects production to retail.', unlock: 'logistics', unlockLevel: 1 }
] as const;
