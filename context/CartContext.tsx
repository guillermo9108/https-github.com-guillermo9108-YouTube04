
import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, MarketplaceItem } from '../types';

interface CartContextType {
    cart: CartItem[];
    addToCart: (item: MarketplaceItem) => void;
    updateQuantity: (itemId: string, delta: number) => void;
    removeFromCart: (itemId: string) => void;
    clearCart: () => void;
    total: number;
}

const CartContext = createContext<CartContextType | null>(null);

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error("useCart must be used within CartProvider");
    return context;
};

export const CartProvider = ({ children }: { children?: React.ReactNode }) => {
    const [cart, setCart] = useState<CartItem[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('sp_cart');
        if (saved) {
            try { setCart(JSON.parse(saved)); } catch (e) {}
        }
        
        // Listen for logout event to clear cart for privacy
        const handleLogout = () => {
            setCart([]);
            localStorage.removeItem('sp_cart');
        };
        window.addEventListener('sp_logout', handleLogout);
        return () => window.removeEventListener('sp_logout', handleLogout);
    }, []);

    const saveCart = (newCart: CartItem[]) => {
        setCart(newCart);
        localStorage.setItem('sp_cart', JSON.stringify(newCart));
    };

    const addToCart = (item: MarketplaceItem) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            let newCart;
            if (existing) {
                // Increment quantity
                newCart = prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
            } else {
                // Add new
                newCart = [...prev, { ...item, quantity: 1 }];
            }
            localStorage.setItem('sp_cart', JSON.stringify(newCart));
            return newCart;
        });
    };

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => {
            const newCart = prev.map(item => {
                if (item.id === itemId) {
                    const newQty = item.quantity + delta;
                    return { ...item, quantity: newQty };
                }
                return item;
            }).filter(item => item.quantity > 0);
            
            localStorage.setItem('sp_cart', JSON.stringify(newCart));
            return newCart;
        });
    };

    const removeFromCart = (itemId: string) => {
        saveCart(cart.filter(i => i.id !== itemId));
    };

    const clearCart = () => saveCart([]);

    const total = cart.reduce((acc, curr) => acc + (Number(curr.price) * curr.quantity), 0);

    return (
        <CartContext.Provider value={{ cart, addToCart, updateQuantity, removeFromCart, clearCart, total }}>
            {children}
        </CartContext.Provider>
    );
};
