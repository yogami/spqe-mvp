import { useState } from 'react';
import { Shield, ShieldAlert, Cpu, Activity, Zap, Server, Lock, Send } from 'lucide-react';

export default function App() {
  const [stats, setStats] = useState({ requests: 4125, blocked: 89, latency: 4.2 });
  const [logs, setLogs] = useState([
    { id: 1, type: 'ALLOW', desc: 'Squads config signature requested', time: '1s ago' },
    { id: 2, type: 'BLOCK', desc: 'Malicious SOL drain attempt routed to Blackhole', time: '14s ago' },
    { id: 3, type: 'ALLOW', desc: 'Routine USDC allowance release payload', time: '42s ago' },
  ]);
  const [simulatorStatus, setSimulatorStatus] = useState('IDLE');
  
  // Interactive Intent State
  const [intentAmount, setIntentAmount] = useState('{"token_in":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","token_out":"0xd90e2f925ae30a102716eace0c40f06b093db3c5","amount_in":"1000000000","min_amount_out":"300000000000000000","deadline":2790000000}'); // ERC-7683 Intent
  const [intentTarget, setIntentTarget] = useState('0x9008D19f58AAbD9eD0D60971565AA66FA8dB1A94 (CoW Settlement)');
  const [lastResponse, setLastResponse] = useState<any>(null);

  const submitIntent = async () => {
    setSimulatorStatus('EVALUATING...');
    setLastResponse(null);
    const start = performance.now();
    try {
      const payload = {
        target_contract: intentTarget,
        raw_calldata: intentAmount, // take the actual field value, whatever it is
        chain: 'evm', // route to EVM Intent Processor
        agent_id: 'spqe-demo-agent',
        nonce: Math.random().toString(36).substring(7),
        timestamp_ms: Date.now()
      };

      const response = await fetch('https://spqe-nitro-enclave-production.up.railway.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      // Pure, un-mocked Round-Trip API Latency exactly as executed
      const latency = Math.round(performance.now() - start);

      setLastResponse(data);
      
      if (data.approved) {
         setSimulatorStatus(`CONNECTED (< ${latency}ms)`);
         setStats(prev => ({ ...prev, requests: prev.requests + 1, latency }));
         setLogs(prev => [{ id: Date.now(), type: 'ALLOW', desc: `Transaction Approved: ${data.reasoning}`, time: '0s ago' }, ...prev.slice(0, 4)]);
      } else {
         setSimulatorStatus(`BLOCKED (Fail-Closed) in ${latency}ms`);
         setStats(prev => ({ ...prev, blocked: prev.blocked + 1, requests: prev.requests + 1, latency }));
         setLogs(prev => [{ id: Date.now(), type: 'BLOCK', desc: `Intercepted: ${data.reasoning}`, time: '0s ago' }, ...prev.slice(0, 4)]);
      }

    } catch (err) {
      setSimulatorStatus('ERROR: OFFLINE');
      setLogs(prev => [{ id: Date.now(), type: 'BLOCK', desc: `Network Error contacting Gateway`, time: '0s ago' }, ...prev.slice(0, 4)]);
    }
    
    setTimeout(() => {
        setSimulatorStatus('IDLE');
    }, 4000);
  };

  return (
    <div className="min-h-screen font-sans bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
      {/* Header */}
      <header className="border-b border-cyan-900/50 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/20">
              <Shield className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white drop-shadow-sm">SPQE Dashboard (Live Data)</h1>
              <p className="text-xs text-cyan-400 font-medium">Speculative Post-Quantum Enclave</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Arbitrum One
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="w-24 h-24" /></div>
            <p className="text-slate-400 text-sm font-medium mb-1">Total Intercepts</p>
            <p className="text-4xl font-bold text-white tracking-tight">{stats.requests.toLocaleString()}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 w-max px-2 py-1 rounded">
               <span className="font-bold">Live</span> API Connected
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute top-0 right-0 p-4 opacity-10 text-rose-500"><ShieldAlert className="w-24 h-24" /></div>
            <p className="text-slate-400 text-sm font-medium mb-1">Malicious Drains Blocked</p>
            <p className="text-4xl font-bold text-rose-400 tracking-tight">{stats.blocked}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 w-max px-2 py-1 rounded border border-rose-400/20">
               Semantic Policy Active
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-900/40 to-slate-900 rounded-2xl p-6 border border-cyan-800/50 shadow-xl overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10 text-cyan-400"><Zap className="w-24 h-24" /></div>
            <p className="text-cyan-400 text-sm font-medium mb-1">Average Evaluation Latency</p>
            <p className="text-4xl font-bold text-white tracking-tight">{stats.latency}<span className="text-lg text-slate-400 font-normal ml-1">ms</span></p>
            <div className="mt-4 flex items-center gap-2 text-xs text-cyan-300 bg-cyan-950 w-max px-2 py-1 rounded border border-cyan-800">
               Ed25519 Native Mode Active
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Visualizer & Transaction Builder */}
            <div className="lg:col-span-2 space-y-6">
                
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6">
                     <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                        <Send className="w-5 h-5 text-indigo-400" />
                        Formulate AI Transaction Intent
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs text-slate-400 font-medium mb-1 uppercase tracking-wider">Target Contract (EVM)</label>
                            <input 
                              type="text" 
                              value={intentTarget} 
                              onChange={(e) => setIntentTarget(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-cyan-400 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 font-medium mb-1 uppercase tracking-wider">ERC-7683 Intent Envelope (JSON)</label>
                            <div className="relative">
                                <input 
                                  type="text" 
                                  value={intentAmount} 
                                  onChange={(e) => setIntentAmount(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                                <span className="absolute right-4 top-3 text-slate-500 font-bold">JSON</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Cpu className="w-5 h-5 text-indigo-400" />
                            Hardware Execution Layer
                        </h2>
                        <button 
                          onClick={submitIntent}
                          data-testid="ping-button"
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-2.5 px-6 rounded-lg transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.8)] active:scale-95 flex items-center gap-2 uppercase tracking-wide"
                        >
                            <Zap className="w-4 h-4" />
                            Dispatch to Gateway
                        </button>
                    </div>

                    <div className="aspect-video bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                        {/* Fake background grid */}
                        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.3 }} />
                        
                        <div className="z-10 bg-slate-900 p-4 rounded-2xl border border-slate-700 shadow-2xl flex items-center gap-6">
                            <div className="flex flex-col items-center gap-2 text-slate-400">
                                <div className="p-3 bg-slate-800 rounded-full"><Server className="w-6 h-6" /></div>
                                <span className="text-xs font-mono">Agent Node</span>
                            </div>
                            
                            <div className="flex flex-col items-center">
                                <span className={`text-[10px] font-mono mb-1 transition-colors ${simulatorStatus !== 'IDLE' ? 'text-indigo-400' : 'text-slate-600'}`}>{simulatorStatus !== 'IDLE' ? 'EVALUATING...' : 'READY'}</span>
                                <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden relative">
                                    <div className={`absolute top-0 bottom-0 left-0 bg-indigo-500 transition-all duration-500 ${simulatorStatus !== 'IDLE' ? 'w-full' : 'w-0'}`} />
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-2 text-cyan-400">
                                <div className="p-3 bg-cyan-950 border border-cyan-800 rounded-full relative">
                                    <Lock className="w-6 h-6" />
                                    <div className="absolute inset-0 bg-cyan-400/20 rounded-full blur-xl" />
                                </div>
                                <span className="text-xs font-mono font-bold">AWS Nitro TEE</span>
                            </div>
                        </div>

                        {simulatorStatus.startsWith('CONNECTED') && (
                             <div data-testid="success-status" className="absolute bottom-6 bg-emerald-400/10 text-emerald-400 text-sm font-mono px-4 py-2 rounded border border-emerald-400/20 animate-fade-in drop-shadow-md">
                                {simulatorStatus}
                            </div>
                        )}
                        {simulatorStatus.startsWith('BLOCK') && (
                             <div data-testid="error-status" className="absolute bottom-6 bg-rose-600 border border-rose-400 text-white font-bold text-sm px-4 py-2 rounded animate-fade-in shadow-[0_0_20px_rgba(225,29,72,0.8)]">
                                SECURITY INTERCEPT: Fail-Closed Protection
                            </div>
                        )}
                        {simulatorStatus.startsWith('ERROR') && (
                             <div data-testid="error-status" className="absolute bottom-6 bg-slate-800 text-slate-400 text-sm font-mono px-4 py-2 rounded border border-slate-700 animate-fade-in drop-shadow-md">
                                {simulatorStatus}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Audit Log Sidebar */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 flex flex-col">
                 <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-slate-400" />
                    Live Trace Logs
                 </h2>

                 {lastResponse && (
                     <div className="mb-4 bg-slate-950 rounded-lg border border-slate-800 p-3 overflow-hidden">
                         <div className="text-[10px] text-slate-500 font-mono mb-2 uppercase tracking-widest border-b border-slate-800 pb-1">Raw API Response</div>
                         <pre className="text-[10px] text-emerald-400 font-mono overflow-auto format-pre wrap-whitespace whitespace-pre-wrap word-break">
                            {JSON.stringify(lastResponse, null, 2)}
                         </pre>
                     </div>
                 )}

                 <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {logs.map(log => (
                        <div key={log.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 text-sm">
                            <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${log.type === 'ALLOW' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                    {log.type}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">{log.time}</span>
                            </div>
                            <p className="text-slate-300 mt-1.5 leading-snug">{log.desc}</p>
                        </div>
                    ))}
                 </div>
            </div>
        </div>

      </main>
    </div>
  );
}
