import { apiRequest } from "@/lib/queryClient";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayOptions {
  amount: number;
  bookingId?: string;
  bookingIds?: string[];
  onSuccess: () => void;
  onError?: (error: string) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  description?: string;
}

export function useRazorpay() {
  const openCheckout = async (options: RazorpayOptions) => {
    try {
      const isBulk = options.bookingIds && options.bookingIds.length > 0;
      const endpoint = isBulk ? "/api/payments/create-bulk-order" : "/api/payments/create-order";
      const body = isBulk
        ? { bookingIds: options.bookingIds }
        : { bookingId: options.bookingId, amount: options.amount.toString() };

      const res = await apiRequest("POST", endpoint, body);
      const orderData = await res.json();

      const rzpOptions = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Perfusion Healthcare",
        description: options.description || "Healthcare Service Payment",
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            await apiRequest("POST", "/api/payments/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId: options.bookingId,
              bookingIds: options.bookingIds,
            });
            options.onSuccess();
          } catch {
            options.onError?.("Payment verification failed");
          }
        },
        prefill: options.prefill || {},
        theme: { color: "#dc2626" },
        modal: {
          ondismiss: () => {
            options.onError?.("Payment cancelled");
          },
        },
      };

      const rzp = new window.Razorpay(rzpOptions);
      rzp.open();
    } catch {
      options.onError?.("Failed to initiate payment");
    }
  };

  return { openCheckout };
}
