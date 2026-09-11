import AuthGate from "@/components/AuthGate";
import Dashboard from "@/components/Dashboard";
import SignOutButton from "@/components/SignOutButton";

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
        <div className="meta">
          <div id="masthead-meta" />
          <SignOutButton />
        </div>
      </header>
      <AuthGate>
        <Dashboard />
      </AuthGate>
    </main>
  );
}
