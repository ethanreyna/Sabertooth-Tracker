import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ChevronLeft, ChevronDown, ChevronUp, CircleCheck, FolderPlus, Package, Pencil, Plus, Trash2, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, Field, NameField, TonedBadge } from '@/components/bits';
import { ImportProjectDialog } from '@/components/import-project-dialog';
import { catalogue } from '@/items';
import { ago, sep, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ParsedProject } from '@/lib/parse-project';
import type { DB, Project, ProjectRequirement, ProjectStage } from '@/types';

const contributedFor = (project: Project, requirementId: string): number =>
  project.contributions
    .filter((c) => c.requirementId === requirementId)
    .reduce((sum, c) => sum + c.qty, 0);

const stageStats = (project: Project, stage: ProjectStage) => {
  const total = stage.requirements.length;
  const done = stage.requirements.filter((r) => contributedFor(project, r.id) >= r.qty && r.qty > 0).length;
  return { done, total };
};

const projectStats = (project: Project) => {
  const total = project.stages.reduce((sum, st) => sum + st.requirements.length, 0);
  const done = project.stages.reduce((sum, st) => sum + stageStats(project, st).done, 0);
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
};

/** Turns a parsed draft into real records — the one place ids get assigned,
 *  so an imported project and a hand-built one end up the same shape. */
function buildProject(draft: ParsedProject, addedBy: string): Project {
  const at = new Date().toISOString();
  return {
    id: uid(),
    name: draft.name || 'Untitled project',
    description: '',
    addedBy, at,
    stages: draft.stages.map((st) => ({
      id: uid(),
      name: st.name,
      description: st.description,
      requirements: st.requirements.map((r) => ({ id: uid(), item: r.item, qty: r.qty, unit: r.unit })),
    })),
    contributions: [],
  };
}

function ContributeDialog({ requirement, close, onAdd, memberNames }: {
  requirement: ProjectRequirement;
  close: () => void;
  onAdd: (qty: number, by: string, note: string) => void;
  memberNames: string[];
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const qty = Math.max(1, Math.round(Number(f.get('qty') || 0)));
    if (!qty) return;
    onAdd(qty, String(f.get('by') || '').trim(), String(f.get('note') || '').trim());
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Turn in {requirement.item}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Quantity" htmlFor="contrib-qty">
            <Input id="contrib-qty" name="qty" type="number" min={1} required autoFocus placeholder="1" />
          </Field>
          <Field label="Turned in by" htmlFor="contrib-by">
            <NameField id="contrib-by" name="by" options={memberNames} required
              defaultValue={memberNames[0] || ''} placeholder="Pick a member or write in" />
          </Field>
          <Field label="Note (optional)" htmlFor="contrib-note">
            <Input id="contrib-note" name="note" placeholder="Anything worth flagging" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit">Log it</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStageDialog({ close, onAdd }: { close: () => void; onAdd: (name: string, description: string) => void }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim();
    if (!name) return;
    onAdd(name, String(f.get('description') || '').trim());
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add a stage</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Stage name" htmlFor="stage-name">
            <Input id="stage-name" name="name" required autoFocus placeholder="e.g. Stage 4: Docks" />
          </Field>
          <Field label="Description (optional)" htmlFor="stage-desc">
            <Textarea id="stage-desc" name="description" rows={2} placeholder="What this stage covers" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit">Add stage</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddRequirementDialog({ close, onAdd, itemNames }: {
  close: () => void;
  onAdd: (item: string, qty: number, unit: string) => void;
  itemNames: string[];
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const item = String(f.get('item') || '').trim();
    const qty = Math.max(1, Math.round(Number(f.get('qty') || 0)));
    if (!item || !qty) return;
    onAdd(item, qty, String(f.get('unit') || '').trim());
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add a requirement</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Item" htmlFor="req-item">
            <NameField id="req-item" name="item" options={['Septims', ...itemNames]} required
              placeholder="Search items, or write one in" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity" htmlFor="req-qty">
              <Input id="req-qty" name="qty" type="number" min={1} required placeholder="400" />
            </Field>
            <Field label="Unit (optional)" htmlFor="req-unit">
              <Input id="req-unit" name="unit" placeholder="Septims" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit">Add requirement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequirementRow({ project, requirement, readOnly, onContribute, onDelete, onDeleteContribution }: {
  project: Project;
  requirement: ProjectRequirement;
  readOnly: boolean;
  onContribute: () => void;
  onDelete: () => void;
  onDeleteContribution: (id: string) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const got = contributedFor(project, requirement.id);
  const done = got >= requirement.qty && requirement.qty > 0;
  const pct = requirement.qty > 0 ? Math.min(100, (got / requirement.qty) * 100) : 0;
  const log = project.contributions
    .filter((c) => c.requirementId === requirement.id)
    .slice().reverse();

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          {requirement.item}
        </span>
        <span className={cn('shrink-0 text-sm font-medium tabular-nums', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
          {sep(got)} / {sep(requirement.qty)}{requirement.unit ? ` ${requirement.unit}` : ''}
        </span>
        {done && <CircleCheck className="size-4 shrink-0 text-emerald-500" />}
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon-xs" aria-label={`Turn in ${requirement.item}`} onClick={onContribute}>
              <Plus />
            </Button>
            <Button
              variant="ghost" size="icon-xs" className="text-destructive"
              aria-label={`Remove ${requirement.item}`}
              onClick={() => { if (confirm(`Remove "${requirement.item}" from this stage?`)) onDelete(); }}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <Progress
        value={pct}
        className={cn('[&_[data-slot=progress-indicator]]:transition-all', done
          ? '[&_[data-slot=progress-indicator]]:bg-emerald-500'
          : '[&_[data-slot=progress-indicator]]:bg-amber-500')}
      />
      {log.length > 0 && (
        <button
          type="button" onClick={() => setShowLog((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {log.length} turn-in{log.length === 1 ? '' : 's'}
        </button>
      )}
      {showLog && (
        <div className="space-y-1 rounded-md border bg-muted/30 px-2 py-1.5">
          {log.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{sep(c.qty)}</span>
              <span className="min-w-0 flex-1 truncate">
                {c.by || 'someone'}{c.note ? ` — ${c.note}` : ''} · {ago(c.at)}
              </span>
              {!readOnly && (
                <button
                  type="button" aria-label="Remove this turn-in"
                  className="shrink-0 hover:text-destructive"
                  onClick={() => onDeleteContribution(c.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageSection({ project, stage, readOnly, memberNames, itemNames, update }: {
  project: Project;
  stage: ProjectStage;
  readOnly: boolean;
  memberNames: string[];
  itemNames: string[];
  update: (fn: (d: DB) => void) => void;
}) {
  const [contributing, setContributing] = useState<ProjectRequirement | null>(null);
  const [addingReq, setAddingReq] = useState(false);
  const { done, total } = stageStats(project, stage);
  const complete = total > 0 && done === total;

  const withProject = (fn: (p: Project) => void) => update((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (p) fn(p);
  });

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-1 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{stage.name}</p>
            {stage.description && <p className="mt-0.5 text-xs text-muted-foreground">{stage.description}</p>}
          </div>
          <TonedBadge tone={complete ? 'green' : 'neutral'}>
            {total > 0 ? `${done}/${total}` : 'No requirements'}
          </TonedBadge>
          {!readOnly && (
            <Button
              variant="ghost" size="icon-xs" className="text-destructive"
              aria-label={`Remove stage ${stage.name}`}
              onClick={() => {
                if (confirm(`Remove "${stage.name}" and everything logged toward it?`)) {
                  withProject((p) => {
                    const reqIds = new Set(stage.requirements.map((r) => r.id));
                    p.stages = p.stages.filter((s) => s.id !== stage.id);
                    p.contributions = p.contributions.filter((c) => !reqIds.has(c.requirementId));
                  });
                }
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>

        <div className="divide-y">
          {stage.requirements.map((r) => (
            <RequirementRow
              key={r.id}
              project={project}
              requirement={r}
              readOnly={readOnly}
              onContribute={() => setContributing(r)}
              onDelete={() => withProject((p) => {
                p.stages = p.stages.map((s) => (s.id !== stage.id ? s : {
                  ...s, requirements: s.requirements.filter((x) => x.id !== r.id),
                }));
                p.contributions = p.contributions.filter((c) => c.requirementId !== r.id);
              })}
              onDeleteContribution={(id) => withProject((p) => {
                p.contributions = p.contributions.filter((c) => c.id !== id);
              })}
            />
          ))}
          {stage.requirements.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">Nothing needed here yet.</p>
          )}
        </div>

        {!readOnly && (
          <Button variant="outline" size="xs" className="mt-2" onClick={() => setAddingReq(true)}>
            <Plus />Add requirement
          </Button>
        )}
      </CardContent>

      {contributing && (
        <ContributeDialog
          requirement={contributing}
          memberNames={memberNames}
          close={() => setContributing(null)}
          onAdd={(qty, by, note) => withProject((p) => {
            p.contributions.push({ id: uid(), requirementId: contributing.id, qty, by, note, at: new Date().toISOString() });
          })}
        />
      )}
      {addingReq && (
        <AddRequirementDialog
          itemNames={itemNames}
          close={() => setAddingReq(false)}
          onAdd={(item, qty, unit) => withProject((p) => {
            p.stages = p.stages.map((s) => (s.id !== stage.id ? s : {
              ...s, requirements: [...s.requirements, { id: uid(), item, qty, unit }],
            }));
          })}
        />
      )}
    </Card>
  );
}

function ProjectDetail({ project, readOnly, memberNames, itemNames, update, onBack }: {
  project: Project;
  readOnly: boolean;
  memberNames: string[];
  itemNames: string[];
  update: (fn: (d: DB) => void) => void;
  onBack: () => void;
}) {
  const [addingStage, setAddingStage] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const stats = projectStats(project);

  const withProject = (fn: (p: Project) => void) => update((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (p) fn(p);
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="xs" onClick={onBack}><ChevronLeft />All projects</Button>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{project.name}</h2>
          {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {project.addedBy ? `Added by ${project.addedBy}` : 'Added'} {ago(project.at)}
          </p>
        </div>
        {!readOnly && (
          <Button variant="ghost" size="icon-xs" aria-label="Edit project" onClick={() => setEditingHeader(true)}>
            <Pencil />
          </Button>
        )}
      </div>

      <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Overall progress</span>
          <span className="tabular-nums text-muted-foreground">
            {stats.done}/{stats.total} requirements met
          </span>
        </div>
        <Progress value={stats.pct} />
      </div>

      <div className="space-y-3">
        {project.stages.map((st) => (
          <StageSection
            key={st.id} project={project} stage={st} readOnly={readOnly}
            memberNames={memberNames} itemNames={itemNames} update={update}
          />
        ))}
        {project.stages.length === 0 && <EmptyState>No stages yet.</EmptyState>}
      </div>

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={() => setAddingStage(true)}>
          <Plus />Add stage
        </Button>
      )}

      {addingStage && (
        <AddStageDialog
          close={() => setAddingStage(false)}
          onAdd={(name, description) => withProject((p) => {
            p.stages.push({ id: uid(), name, description, requirements: [] });
          })}
        />
      )}

      {editingHeader && (
        <Dialog open onOpenChange={(open) => { if (!open) setEditingHeader(false); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const name = String(f.get('name') || '').trim();
                if (!name) return;
                const description = String(f.get('description') || '').trim();
                withProject((p) => { p.name = name; p.description = description; });
                setEditingHeader(false);
              }}
            >
              <Field label="Name" htmlFor="proj-edit-name">
                <Input id="proj-edit-name" name="name" required autoFocus defaultValue={project.name} />
              </Field>
              <Field label="Description (optional)" htmlFor="proj-edit-desc">
                <Textarea id="proj-edit-desc" name="description" rows={2} defaultValue={project.description} />
              </Field>
              <DialogFooter>
                <Button
                  type="button" variant="outline" className="mr-auto text-destructive"
                  onClick={() => {
                    if (confirm(`Delete "${project.name}" and everything logged toward it? This can't be undone.`)) {
                      update((d) => { d.projects = d.projects.filter((p) => p.id !== project.id); });
                      setEditingHeader(false);
                      onBack();
                    }
                  }}
                >
                  <Trash2 />Delete project
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingHeader(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Big multi-stage undertakings — a stronghold expansion, a guild hall — with
 * a cost list per stage and a running tally of what has actually been turned
 * in. Reading is open to guests; only members log turn-ins or change the plan.
 */
export function Projects({ db, update, readOnly, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  memberNames: string[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const itemNames = catalogue(db.items).map((i) => i.name);

  const selected = selectedId ? db.projects.find((p) => p.id === selectedId) : null;
  if (selected) {
    return (
      <ProjectDetail
        project={selected} readOnly={readOnly} memberNames={memberNames} itemNames={itemNames}
        update={update} onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setImporting(true)}><Upload />Import a project</Button>
          <Button
            size="sm" variant="outline"
            onClick={() => {
              const id = uid();
              update((d) => {
                d.projects.push({
                  id, name: 'Untitled project', description: '',
                  stages: [], contributions: [], addedBy: memberNames[0] || '', at: new Date().toISOString(),
                });
              });
              setSelectedId(id);
            }}
          >
            <FolderPlus />New project
          </Button>
        </div>
      )}

      {db.projects.length === 0 ? (
        <EmptyState>
          <Package className="mx-auto mb-2 size-6 text-muted-foreground" />
          No projects yet. Paste a stage-by-stage brief with Import a project, or start one from
          scratch.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {db.projects.map((p) => {
            const stats = projectStats(p);
            const complete = stats.total > 0 && stats.done === stats.total;
            return (
              <button key={p.id} type="button" className="text-left" onClick={() => setSelectedId(p.id)}>
                <Card className="h-full transition-colors hover:border-foreground/20">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      {complete && <TonedBadge tone="green">Complete</TonedBadge>}
                    </div>
                    {p.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                    <Progress value={stats.pct} />
                    <p className="text-xs text-muted-foreground">
                      {stats.total > 0
                        ? `${stats.done}/${stats.total} requirements met across ${p.stages.length} stage${p.stages.length === 1 ? '' : 's'}`
                        : 'No requirements yet'}
                    </p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {importing && (
        <ImportProjectDialog
          close={() => setImporting(false)}
          onCreate={(draft) => {
            const project = buildProject(draft, memberNames[0] || '');
            update((d) => { d.projects.push(project); });
            setSelectedId(project.id);
          }}
        />
      )}
    </div>
  );
}
