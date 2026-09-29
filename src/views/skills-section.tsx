import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SkillTracker } from '@/views/skill-tracker';
import type { DB } from '@/types';

export type SkillsTab = 'tracker';

/**
 * Everything about what the guild can do, behind one sidebar entry. Only the
 * tracker so far; it sits behind a tab because more is coming and a tab added
 * later shouldn't move the page people already know.
 */
export function SkillsSection({ db, update, readOnly, memberNames, tab, onTabChange }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  memberNames: string[];
  tab: SkillsTab;
  onTabChange: (t: SkillsTab) => void;
}) {
  return (
    <Tabs value={tab} onValueChange={() => onTabChange('tracker')}>
      <TabsList>
        <TabsTrigger value="tracker">
          Skill Tracker{db.skills.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">{db.skills.length}</span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tracker" className="mt-4">
        <SkillTracker db={db} update={update} readOnly={readOnly} memberNames={memberNames} />
      </TabsContent>
    </Tabs>
  );
}
