import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { csrfGuard } from '../../middleware/csrfGuard';
import { CourseController, defaultCourseController } from './controller';
import { defaultDirectoryController } from '../directory/controller';

export function createCoursesRouter(controller: CourseController = defaultCourseController): Router {
  const router = Router();

  router.use(authenticate);
  router.use(requireRole('admin', 'pt'));

  // 1. Static query endpoints (MUST precede /:id)
  // "นัดวันนี้" (for today's facial verification candidate pool & reception dashboard)
  router.get('/today', controller.getTodayAppointments);

  // "ปฏิทิน" (calendar view for month / date range)
  router.get('/calendar', controller.getCalendarView);

  // 2. Course CRUD
  router.get('/', controller.listCourses);
  router.post('/', csrfGuard, controller.createCourse);
  router.get('/:id', controller.getCourseById);
  router.patch('/:id', csrfGuard, controller.updateCourse);
  router.delete('/:id', csrfGuard, controller.deleteCourse);
  router.delete('/:id/days/:date', csrfGuard, controller.deleteCourseDay);

  // 3. Aliases for exercises, modpacks, and minigame questions
  router.delete('/exercises/:id', defaultDirectoryController.deleteExercise);
  router.delete('/modpacks/:id', defaultDirectoryController.deleteModpack);
  router.delete('/minigames/:id/questions/:questionId', defaultDirectoryController.deleteQuestion);
  router.delete('/minigame-questions/:questionId', defaultDirectoryController.deleteQuestion);

  return router;
}

export const courseRoutes = createCoursesRouter();
