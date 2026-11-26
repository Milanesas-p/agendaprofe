import type { Student } from "@/lib/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  /** The paused student the teacher just picked, or null to keep it closed. */
  student: Student | null;
  busy?: boolean;
  /** Overrides the sentence under the title (the directory explains it differently). */
  description?: string;
  onCancel: () => void;
  onConfirm: (student: Student) => void | Promise<void>;
};

/**
 * Asks whether to bring a paused student back right where the teacher picked
 * them, so booking a class never sends them to the directory to flip the switch
 * first. Reactivating keeps the schedule, history and balance untouched.
 */
export function ReactivateStudent({ student, busy = false, description, onCancel, onConfirm }: Props) {
  return (
    <AlertDialog open={student !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ese alumno está inactivo</AlertDialogTitle>
          <AlertDialogDescription>
            {student
              ? (description ?? `${student.name} está en pausa. ¿Querés reactivarlo para seguir con la clase?`)
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            No
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              // Keep the dialog open while the reactivation runs.
              event.preventDefault();
              if (student) void onConfirm(student);
            }}
          >
            Sí, reactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
