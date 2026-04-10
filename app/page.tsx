export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <p className="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-2">
          CRO Proposal Engine
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Reply to any client request in hours,
          <span className="text-green-600"> not days.</span>
        </h1>
        <p className="text-lg text-gray-500 mb-6">
          Turn emails, PDFs, and RFPs into professional proposals without pulling your scientists into sales.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <span className="text-sm text-gray-600 flex items-center gap-1.5"><span className="text-green-500 font-bold">✓</span> Paste any request</span>
          <span className="text-sm text-gray-600 flex items-center gap-1.5"><span className="text-green-500 font-bold">✓</span> Quote in under an hour</span>
          <span className="text-sm text-gray-600 flex items-center gap-1.5"><span className="text-green-500 font-bold">✓</span> Win more, respond faster</span>
        </div>
        <div className="flex gap-4">
          <a
            href="/login"
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
          >
            Get started
          </a>
          <a
            href="/dashboard"
            className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
