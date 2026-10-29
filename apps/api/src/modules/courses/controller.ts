import { Request, Response, NextFunction } from 'express';
import { CourseService, defaultCourseService } from './service';
import {
  CreateCourseSchema,
  UpdateCourseSchema,
  CourseQuerySchema,
  TodayAppointmentsQuerySchema,
  CalendarViewQuerySchema,
} from './schema';
import { AppError } from '../../middleware/errorHandler';

export class CourseController {
  constructor(private service: CourseService = defaultCourseService) {}

  createCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const input = CreateCourseSchema.parse(req.body);
      const course = await this.service.createCourse(input, req.user, req.ip);
      res.status(201).json({ ok: true, data: course });
    } catch (err) {
      next(err);
    }
  };

  getCourseById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const course = await this.service.getCourseById(id, req.user);
      res.status(200).json({ ok: true, data: course });
    } catch (err) {
      next(err);
    }
  };

  updateCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const input = UpdateCourseSchema.parse(req.body);
      const course = await this.service.updateCourse(id, input, req.user, req.ip);
      res.status(200).json({ ok: true, data: course });
    } catch (err) {
      next(err);
    }
  };

  deleteCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      await this.service.deleteCourse(id, req.user, req.ip);
      res.status(200).json({ ok: true, message: 'Course cancelled successfully' });
    } catch (err) {
      next(err);
    }
  };

  deleteCourseDay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const date = String(req.params.date);
      await this.service.deleteCourseDay(id, date, req.user);
      res.status(200).json({ ok: true, message: `Day ${date} removed from course successfully` });
    } catch (err) {
      next(err);
    }
  };

  listCourses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = CourseQuerySchema.parse(req.query);
      const courses = await this.service.listCourses(filter, req.user);
      res.status(200).json({ ok: true, data: courses });
    } catch (err) {
      next(err);
    }
  };

  getTodayAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = TodayAppointmentsQuerySchema.parse(req.query);
      const appointments = await this.service.getTodayAppointments(filter, req.user);
      res.status(200).json({ ok: true, data: appointments });
    } catch (err) {
      next(err);
    }
  };

  getCalendarView = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = CalendarViewQuerySchema.parse(req.query);
      const calendarData = await this.service.getCalendarView(filter, req.user);
      res.status(200).json({ ok: true, data: calendarData });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultCourseController = new CourseController();
