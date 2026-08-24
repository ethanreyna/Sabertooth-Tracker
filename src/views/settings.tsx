import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Roster } from '@/views/roster';
import { Roles } from '@/views/roles';
import type { DB } from '@/types';

export type SettingsTab = 'roster' | 'roles';

/**
 * Who is in the guild and what they can be. Roster and roles were two sidebar
 * entries, but they are one job — you assign a role the moment you look at a
 * member — so they sit behind one entry with a tab between them.
 */
export function Settings({ db, update, readOnly, tab, onTabChange, onEditRole }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  tab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
  onEditRole: (id: string) => void;
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v === 'roles' ? 'roles' : 'roster')}>
      <TabsList>
        <TabsTrigger value="roster">
          Roster{db.members.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">{db.members.length}</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="roles">
          Roles{db.roles.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">{db.roles.length}</span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="roster" className="mt-4">
        <Roster db={db} update={update} readOnly={readOnly} />
      </TabsContent>

      <TabsContent value="roles" className="mt-4">
        <Roles db={db} update={update} readOnly={readOnly} onEdit={onEditRole} />
      </TabsContent>
    </Tabs>
  );
}
