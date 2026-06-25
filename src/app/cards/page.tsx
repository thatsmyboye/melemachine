import { CardExplorer } from "@/components/CardExplorer";

export const metadata = { title: "Card Explorer — Mele Machine" };

export default function CardsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Card Explorer</h1>
        <p className="text-sm text-gray-400">
          The Rating Intelligence Engine scores all {""}
          cards for your chosen run environment, platoon split, and weights.
          Sort by raw value or value-for-money.
        </p>
      </div>
      <CardExplorer />
    </div>
  );
}
