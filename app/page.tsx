import Dashboard from "@/components/Dashboard";

export default function Page() {
  return (
    <main className="wrap">
      <header className="masthead">
        <div>
          <p className="kicker">
            <span className="wordmark">digisac</span> · WhatsApp Business
          </p>
          <h1>Volumetria, custos e projeções</h1>
        </div>
        <div className="meta" id="masthead-meta">
          {/* preenchido pelo client */}
        </div>
      </header>
      <Dashboard />
    </main>
  );
}
