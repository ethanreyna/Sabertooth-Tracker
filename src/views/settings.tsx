import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Roster } from '@/views/roster';
import { Roles } from '@/views/roles';
import type { DB } from '@/types';

export type SettingsTab = 'roster' | 'roles' | 'sidebar';

/** A sidebar entry, as the Sidebar tab lists it. */
export interface SectionChoice { id: string; label: string; icon: ReactNode }

/**
 * Who is in the guild and what they can be. Roster and roles were two sidebar
 * entries, but they are one job — you assign a role the moment you look at a
 * member — so they sit behind one entry with a tab between them.
 */
export function Settings({ db, update, readOnly, tab, onTabChange, onEditRole, sections }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  tab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
  onEditRole: (id: string) => void;
  /** Every sidebar entry that can be switched off. */
  sections: SectionChoice[];
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v === 'roles' || v === 'sidebar' ? v : 'roster')}>
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
        {!readOnly && <TabsTrigger value="sidebar">Sidebar</TabsTrigger>}
      </TabsList>

      <TabsContent value="roster" className="mt-4">
        <Roster db={db} update={update} readOnly={readOnly} />
      </TabsContent>

      <TabsContent value="roles" className="mt-4">
        <Roles db={db} update={update} readOnly={readOnly} onEdit={onEditRole} />
      </TabsContent>

      {!readOnly && (
        <TabsContent value="sidebar" className="mt-4">
          <SidebarChoices db={db} update={update} sections={sections} />
        </TabsContent>
      )}
    </Tabs>
  );
}

/**
 * Which sections the sidebar shows, for everyone in the guild. Switching one
 * off only takes it out of the sidebar; what is in it stays, and switching it
 * back on brings it all back. Settings itself can't be switched off, or there
 * would be no way back to this list.
 */
function SidebarChoices({ db, update, sections }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  sections: SectionChoice[];
}) {
  const hidden = new Set(db.settings.hiddenSections);
  const toggle = (id: string, show: boolean) => update((d) => {
    const rest = d.settings.hiddenSections.filter((x) => x !== id);
    d.settings.hiddenSections = show ? rest : [...rest, id];
  });
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium">Sections in the sidebar</p>
          <p className="text-xs text-muted-foreground">
            For the whole guild. A section switched off keeps everything in it — switch it back on and it’s all there.
          </p>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((sec) => (
            <li key={sec.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted [&_svg]:size-4">
                <Checkbox checked={!hidden.has(sec.id)} onCheckedChange={(v) => toggle(sec.id, v === true)} />
                <span className="text-muted-foreground">{sec.icon}</span>
                {sec.label}
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
