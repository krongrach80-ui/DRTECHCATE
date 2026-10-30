import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { csrfGuard } from '../../middleware/csrfGuard';
import { CourseController, defaultCourseController } from './controller';
import { defaultDirectoryController } from '../directory/controller';

export function createCoursesRouter(controller: CourseController = defaultCourseController): Router {
  const router = Router();

  // 1. Public / Kiosk endpoints (Accessible without staff session, MUST precede /:id)
  router.get('/exercises', (req, res, next) => defaultDirectoryController.listExercises(req, res, next));
  router.get('/exercises/:id', (req, res, next) => defaultDirectoryController.getExerciseById(req, res, next));
  router.post('/session-logs', controller.submitSessionLog);
  router.get('/session-logs', controller.getSessionLogs);

  // 2. Staff Authenticated Area (Admin & PT)
  router.use(authenticate);
  router.use(requireRole('admin', 'pt'));

  // 3. Static query endpoints (MUST precede /:id)
  // "นัดวันนี้" (for today's facial verification candidate pool & reception dashboard)
  router.get('/today', controller.getTodayAppointments);

  // "ปฏิทิน" (calendar view for month / date range)
  router.get('/calendar', controller.getCalendarView);

  // 4. Course CRUD
  router.get('/', controller.listCourses);
  router.post('/', csrfGuard, controller.createCourse);
  router.get('/:id', controller.getCourseById);
  router.patch('/:id', csrfGuard, controller.updateCourse);
  router.delete('/:id', csrfGuard, controller.deleteCourse);
  router.delete('/:id/days/:date', csrfGuard, controller.deleteCourseDay);

  // 5. Aliases for exercises, modpacks, and minigame questions
  router.delete('/exercises/:id', defaultDirectoryController.deleteExercise);
  router.delete('/modpacks/:id', defaultDirectoryController.deleteModpack);
  router.delete('/minigames/:id/questions/:questionId', defaultDirectoryController.deleteQuestion);
  router.delete('/minigame-questions/:questionId', defaultDirectoryController.deleteQuestion);

  return router;
}

export const courseRoutes = createCoursesRouter();
