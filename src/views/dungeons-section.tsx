import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Run } from '@/views/run';
import { DungeonTracker } from '@/views/dungeon-tracker';
import { DungeonDatabase } from '@/views/dungeons';
import type { DB } from '@/types';

export type DungeonsTab = 'loot' | 'tracker' | 'database';

/**
 * Everything dungeon-related lives behind one sidebar entry, three tabs deep:
 * splitting loot from a run, watching when a dungeon resets, and the scouted
 * list itself. They used to be two separate sections (Dungeons, Loot Tracker)
 * but all three are the same trip to the same place, just at different points
 * in time.
 */
export function DungeonsSection({
  db, update, readOnly, memberNames, tab, onTabChange, onEditDungeon, onPlaceDungeon,
}: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  memberNames: string[];
  tab: DungeonsTab;
  onTabChange: (t: DungeonsTab) => void;
  onEditDungeon: (id: string) => void;
  onPlaceDungeon: (id: string) => void;
}) {
  const trackedCount = db.dungeons.filter((g) => g.respawnSeconds > 0).length;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v === 'tracker' || v === 'database' ? v : 'loot')}
    >
      <TabsList>
        <TabsTrigger value="loot">Loot Tracker</TabsTrigger>
        <TabsTrigger value="tracker">
          Dungeon Tracker{trackedCount > 0 && (
            <span className="ml-1.5 text-muted-foreground">{trackedCount}</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="database">
          Dungeon Database{db.dungeons.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">{db.dungeons.length}</span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="loot" className="mt-4">
        <Run db={db} memberNames={memberNames} />
      </TabsContent>

      <TabsContent value="tracker" className="mt-4">
        <DungeonTracker db={db} update={update} readOnly={readOnly} />
      </TabsContent>

      <TabsContent value="database" className="mt-4">
        <DungeonDatabase db={db} update={update} readOnly={readOnly} onEdit={onEditDungeon} onPlace={onPlaceDungeon} />
      </TabsContent>
    </Tabs>
  );
}
