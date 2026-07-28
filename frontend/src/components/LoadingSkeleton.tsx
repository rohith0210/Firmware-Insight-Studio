export default function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-32 bg-slate-800/50 rounded-xl"></div>
      <div className="h-96 bg-slate-800/50 rounded-xl"></div>
      <div className="h-64 bg-slate-800/50 rounded-xl"></div>
    </div>
  );
}