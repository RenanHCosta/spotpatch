import Link from "next/link";
import { Badge, Button, Card } from "@spotpatch/ui";
import {
  ArrowRight,
  Check,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
} from "lucide-react";
const products = [
  { name: "Tênis Orbit", price: "R$ 489", color: "bg-[#dce7f7]" },
  { name: "Mochila Field", price: "R$ 329", color: "bg-[#eadfd5]" },
  { name: "Jaqueta Loop", price: "R$ 599", color: "bg-[#dbe8df]" },
];
export default function Demo() {
  return (
    <main className="min-h-screen bg-[#f8f5ef]">
      <header
        data-agent-id="demo-header"
        className="flex items-center justify-between border-b border-black/10 px-5 py-4 md:px-12"
      >
        <div className="flex items-center gap-3 font-black">
          <span className="grid size-9 place-items-center rounded-full bg-black text-white">
            <ShoppingBag size={17} />
          </span>
          FORMA
        </div>
        <nav className="hidden gap-8 text-sm font-semibold md:flex">
          <a href="#novidades">Novidades</a>
          <a href="#beneficios">Benefícios</a>
        </nav>
        <Badge className="bg-black text-white">Loja demo</Badge>
      </header>
      <section
        data-agent-id="home-hero"
        className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-2 md:px-12 md:py-24"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[.25em] text-patch">
            Objetos para todos os dias
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-black leading-[.95] md:text-7xl">
            Design que acompanha seu ritmo.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-slate-600">
            Peças essenciais, materiais duráveis e detalhes pensados para sair do plano e entrar na
            rua.
          </p>
          <Button className="mt-8 rounded-full bg-patch px-6">
            Explorar coleção <ArrowRight className="ml-2" size={17} />
          </Button>
        </div>
        <div className="spot-grid relative min-h-[360px] overflow-hidden rounded-[2rem] bg-[#f3c86a]">
          <div className="absolute left-1/2 top-1/2 h-56 w-72 -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded-[50%_35%_45%_40%] bg-white shadow-2xl">
            <div className="absolute bottom-9 left-10 right-10 h-4 rounded-full bg-slate-950" />
            <div className="absolute left-20 top-12 h-24 w-32 rounded-[50%] bg-slate-100" />
          </div>
          <span className="absolute bottom-5 left-5 rounded-full bg-white px-4 py-2 text-xs font-bold">
            <Target className="mr-2 inline" size={14} />
            Use a extensão aqui
          </span>
        </div>
      </section>
      <section id="novidades" className="mx-auto max-w-7xl px-5 pb-20 md:px-12">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-slate-500">
              Seleção da semana
            </p>
            <h2 className="mt-2 text-3xl font-black">Feitos para circular</h2>
          </div>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {products.map((product, index) => (
            <Card
              data-agent-id={`product-card-${index + 1}`}
              key={product.name}
              className="overflow-hidden border-black/10 bg-white"
            >
              <div className={`grid aspect-[4/3] place-items-center ${product.color}`}>
                <Package size={80} strokeWidth={1} />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-black">{product.name}</h3>
                  <strong>{product.price}</strong>
                </div>
                <p className="mt-2 text-sm text-slate-500">Entrega rápida · troca gratuita</p>
                <Button data-agent-id="product-buy-button" className="mt-5 bg-black md:w-auto">
                  Comprar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
      <section
        id="beneficios"
        data-agent-id="product-benefits"
        className="bg-black px-5 py-16 text-white md:px-12"
      >
        <div className="mx-auto grid max-w-7xl gap-7 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Compra segura" },
            { icon: Sparkles, title: "Qualidade testada" },
            { icon: Check, title: "Troca sem atrito" },
          ].map(({ icon: Icon, title }) => (
            <div key={title} className="flex items-center gap-4">
              <span className="grid size-11 place-items-center rounded-full bg-white/10">
                <Icon />
              </span>
              <div>
                <h3 className="font-bold">{title}</h3>
                <p className="text-sm text-white/60">Benefício demonstrativo da loja.</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer className="flex flex-col items-center justify-between gap-4 px-5 py-8 text-sm md:flex-row md:px-12">
        <p>FORMA · Página de demonstração SpotPatch</p>
        <Link href="/backlog" className="font-bold text-patch">
          Abrir backlog →
        </Link>
      </footer>
    </main>
  );
}
