"use client";

import { useState, useEffect } from "react";
import { CIRISClient } from "@/lib/ciris-sdk";

// Types
interface CreditStatus {
  has_credit: boolean;
  credits_remaining: number;
  free_uses_remaining: number;
  total_uses: number;
  plan_name: string;
  purchase_required: boolean;
  purchase_options?: {
    price_minor: number;
    uses: number;
    currency: string;
  };
}

// Google Play product configuration (matches BillingManager.kt)
interface GooglePlayProduct {
  productId: string;
  credits: number;
  price: string;
  priceMinor: number;
  description: string;
}

const GOOGLE_PLAY_PRODUCTS: GooglePlayProduct[] = [
  {
    productId: "credits_100",
    credits: 100,
    price: "$4.99",
    priceMinor: 499,
    description: "100 CIRIS credits",
  },
  {
    productId: "credits_250",
    credits: 250,
    price: "$9.99",
    priceMinor: 999,
    description: "250 CIRIS credits - Best Value!",
  },
  {
    productId: "credits_600",
    credits: 600,
    price: "$19.99",
    priceMinor: 1999,
    description: "600 CIRIS credits - Most Popular!",
  },
];

type PurchaseStep = "prompt" | "processing" | "success" | "error";

// Detect if running on Android native app
function isNativeAndroidApp(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const nativeAuth = localStorage.getItem("ciris_native_auth");
    if (nativeAuth) {
      const parsed = JSON.parse(nativeAuth);
      return parsed.isNativeApp === true;
    }
    return localStorage.getItem("isNativeApp") === "true";
  } catch {
    return false;
  }
}

// Credit Balance Component
function CreditBalance({
  credits,
  onPurchaseClick,
}: {
  credits: CreditStatus | null;
  onPurchaseClick: () => void;
}) {
  if (!credits) {
    return <div className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>;
  }

  const isFree = credits.free_uses_remaining > 0;
  const isLow = credits.credits_remaining < 5 && credits.free_uses_remaining === 0;
  const isEmpty = !credits.has_credit;

  let icon = "💵";
  let colorClass = "text-blue-600 bg-blue-50 border-blue-200";
  let message = `${credits.credits_remaining} credits remaining`;

  if (isFree) {
    icon = "🎁";
    colorClass =
      credits.free_uses_remaining === 1
        ? "text-orange-600 bg-orange-50 border-orange-200"
        : "text-green-600 bg-green-50 border-green-200";
    message = `${credits.free_uses_remaining} free tries remaining`;
  } else if (isEmpty) {
    icon = "💳";
    colorClass = "text-red-600 bg-red-50 border-red-200";
    message = "0 credits remaining";
  } else if (isLow) {
    icon = "⚠️";
    colorClass = "text-orange-600 bg-orange-50 border-orange-200";
    message = `${credits.credits_remaining} credits remaining`;
  }

  return (
    <div
      className={`${colorClass} border-2 rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow`}
      onClick={() => (isEmpty || isLow) && onPurchaseClick()}
    >
      <div className="flex items-center gap-4">
        <span className="text-5xl">{icon}</span>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{message}</h2>
          <p className="text-sm mt-1">
            {isFree && "Try CIRIS for free! No credit card required."}
            {isEmpty && "Purchase more uses to continue"}
            {isLow && !isFree && "Running low! Purchase more to avoid interruptions"}
            {!isEmpty && !isLow && !isFree && "Click to purchase more"}
          </p>
        </div>
        {(isEmpty || isLow) && (
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Purchase
          </button>
        )}
      </div>
    </div>
  );
}

// Google Play Product Card Component
function ProductCard({
  product,
  onPurchase,
  isPopular,
}: {
  product: GooglePlayProduct;
  onPurchase: (productId: string) => void;
  isPopular?: boolean;
}) {
  return (
    <div
      className={`relative border-2 rounded-xl p-6 transition-all hover:shadow-lg ${
        isPopular
          ? "border-blue-500 bg-gradient-to-br from-blue-50 to-white"
          : "border-gray-200 bg-white hover:border-blue-300"
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            MOST POPULAR
          </span>
        </div>
      )}
      <div className="text-center">
        <div className="text-4xl font-bold text-gray-900 mb-2">{product.credits}</div>
        <div className="text-gray-600 mb-4">credits</div>
        <div className="text-3xl font-bold text-blue-600 mb-2">{product.price}</div>
        <div className="text-sm text-gray-500 mb-4">
          ${(product.priceMinor / product.credits / 100).toFixed(3)} per credit
        </div>
        <button
          onClick={() => onPurchase(product.productId)}
          className={`w-full py-3 rounded-lg font-medium transition-colors ${
            isPopular
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-900 hover:bg-gray-200"
          }`}
        >
          Purchase
        </button>
      </div>
    </div>
  );
}

// Purchase Modal Component for Android
function PurchaseModal({
  isOpen,
  onClose,
  onSuccess,
  credits,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  credits: CreditStatus | null;
}) {
  const [step, setStep] = useState<PurchaseStep>("prompt");
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const handlePurchase = (productId: string) => {
    setSelectedProduct(productId);
    setStep("processing");

    // Trigger native Google Play purchase via URL scheme
    // The Android app intercepts this and launches PurchaseActivity
    window.location.href = `ciris://purchase/${productId}`;

    // Show processing state briefly, then return to prompt
    // The native purchase flow will handle the actual transaction
    setTimeout(() => {
      setStep("prompt");
      onClose();
      // Refresh credits after a delay to pick up any completed purchases
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Prompt Step - Show Google Play Products */}
        {step === "prompt" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Purchase Credits</h2>
              <p className="text-gray-600 mt-2">
                {credits?.free_uses_remaining === 0
                  ? "You've used your free tries! Purchase credits to continue."
                  : "Choose a credit package to continue using CIRIS."}
              </p>
            </div>

            <div className="space-y-4">
              {GOOGLE_PLAY_PRODUCTS.map(product => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  onPurchase={handlePurchase}
                  isPopular={product.productId === "credits_600"}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 justify-center">
              <span>🔒</span>
              <span>Secure payment via Google Play</span>
            </div>

            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Not now
            </button>
          </div>
        )}

        {/* Processing Step */}
        {step === "processing" && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Opening Google Play...</p>
            <p className="text-gray-500 text-sm mt-2">Complete your purchase in the dialog</p>
          </div>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✓</div>
            <h3 className="text-2xl font-bold text-green-600 mb-2">Purchase Successful!</h3>
            <p className="text-gray-700">Credits have been added to your account</p>
          </div>
        )}

        {/* Error Step */}
        {step === "error" && (
          <div className="text-center py-8 space-y-6">
            <div className="text-6xl text-red-500">✕</div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Purchase Failed</h3>
              <p className="text-gray-600">{error}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setError(null);
                  setStep("prompt");
                }}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Billing Page
export default function BillingPage() {
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [client] = useState(() => new CIRISClient());

  const loadCredits = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await client.billing.getCredits();
      setCredits(data);
    } catch (err) {
      console.error("Failed to load credits:", err);
      setError("Failed to load credit information. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredits();
    setIsAndroid(isNativeAndroidApp());

    // Listen for purchase completion events from native app
    const handlePurchaseComplete = (event: CustomEvent) => {
      console.log("Purchase complete event received:", event.detail);
      loadCredits(); // Refresh credits after purchase
    };

    window.addEventListener("ciris_purchase_complete", handlePurchaseComplete as EventListener);
    return () => {
      window.removeEventListener(
        "ciris_purchase_complete",
        handlePurchaseComplete as EventListener
      );
    };
  }, []);

  const handlePurchaseClick = (productId: string) => {
    // Trigger native Google Play purchase via URL scheme
    window.location.href = `ciris://purchase/${productId}`;
  };

  const handlePurchaseSuccess = () => {
    loadCredits();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-600 mt-2">Manage your CIRIS credits and purchases</p>
          {isAndroid && <p className="text-sm text-blue-600 mt-1">Powered by Google Play</p>}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded-lg"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <h3 className="text-xl font-bold text-red-900 mb-2">Connection Error</h3>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={loadCredits}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Credit Balance */}
        {!loading && !error && credits && (
          <div className="space-y-6">
            <CreditBalance credits={credits} onPurchaseClick={() => setShowPurchaseModal(true)} />

            {/* Usage Statistics */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Usage Statistics</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Total Uses</p>
                  <p className="text-2xl font-bold text-gray-900">{credits.total_uses}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Current Plan</p>
                  <p className="text-2xl font-bold text-gray-900">{credits.plan_name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Free Uses</p>
                  <p className="text-2xl font-bold text-gray-900">{credits.free_uses_remaining}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Paid Credits</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {credits.credits_remaining - credits.free_uses_remaining}
                  </p>
                </div>
              </div>
            </div>

            {/* Purchase Options - Google Play Products */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Purchase Credits</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {GOOGLE_PLAY_PRODUCTS.map(product => (
                  <ProductCard
                    key={product.productId}
                    product={product}
                    onPurchase={handlePurchaseClick}
                    isPopular={product.productId === "credits_600"}
                  />
                ))}
              </div>
            </div>

            {/* Information */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-bold text-blue-900 mb-2">About Credits</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Each interaction with CIRIS uses one credit</li>
                <li>• Free tries are provided to new users</li>
                <li>• Purchased credits never expire</li>
                <li>• Secure payments via Google Play</li>
              </ul>
            </div>
          </div>
        )}

        {/* Purchase Modal */}
        <PurchaseModal
          isOpen={showPurchaseModal}
          onClose={() => setShowPurchaseModal(false)}
          onSuccess={handlePurchaseSuccess}
          credits={credits}
        />
      </div>
    </div>
  );
}
