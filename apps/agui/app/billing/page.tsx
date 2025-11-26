"use client";

// Billing Page - Standalone Mode
export default function BillingPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-600 mt-2">Credit and subscription management</p>
        </div>

        {/* Unavailable Notice */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">💳</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Billing Unavailable</h2>
          <p className="text-gray-700 leading-relaxed max-w-2xl mx-auto">
            Currently depends on CIRIS billing backend and unavailable in standalone mode.
          </p>
          <p className="text-gray-600 mt-4 text-sm">
            Standalone deployments do not require billing or credit purchases.
          </p>
        </div>

        {/* Information */}
        <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-bold text-gray-900 mb-3">ℹ️ About Standalone Mode</h3>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• Standalone mode runs independently without cloud billing services</li>
            <li>• All features are available without credit or usage limitations</li>
            <li>• Configure your own LLM provider API keys in the setup wizard</li>
            <li>• No subscription or payment processing required</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
