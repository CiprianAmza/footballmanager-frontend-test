import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

export interface SocialFeedPost {
  id: number;
  handle: string;
  tone: string;
  context: string;
  body: string;
  upvotes: number;
  replies: number;
  seasonNumber: number;
  day: number;
  createdAt: number;
}

type FeedFilter = 'all' | 'positive' | 'critical' | 'harsh';
type FeedOrder = 'hot' | 'new';

@Component({
  selector: 'app-social-feed',
  templateUrl: './social-feed.component.html',
  styleUrls: ['./social-feed.component.css']
})
export class SocialFeedComponent implements OnInit {
  posts: SocialFeedPost[] = [];
  loading = true;
  error = '';
  filter: FeedFilter = 'all';
  order: FeedOrder = 'hot';
  query = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadFeed();
  }

  get visiblePosts(): SocialFeedPost[] {
    const query = this.query.trim().toLowerCase();
    const filtered = this.posts.filter(post => {
      if (this.filter === 'positive' && !['ECSTATIC', 'POSITIVE', 'LOYAL', 'HUMOR'].includes(post.tone)) return false;
      if (this.filter === 'critical' && !['CRITICAL', 'FRUSTRATED', 'WORRIED', 'DEMANDING', 'ANALYTICAL'].includes(post.tone)) return false;
      if (this.filter === 'harsh' && !['HARSH', 'ANGRY'].includes(post.tone)) return false;
      return !query || `${post.handle} ${post.context} ${post.body}`.toLowerCase().includes(query);
    });
    return [...filtered].sort((left, right) => this.order === 'new'
      ? right.id - left.id
      : (right.upvotes + right.replies * 3) - (left.upvotes + left.replies * 3));
  }

  get fanMood(): string {
    if (!this.posts.length) return 'Quiet';
    const harsh = this.posts.filter(post => ['HARSH', 'ANGRY', 'FRUSTRATED'].includes(post.tone)).length;
    const positive = this.posts.filter(post => ['ECSTATIC', 'POSITIVE', 'LOYAL', 'HUMOR'].includes(post.tone)).length;
    if (harsh > positive * 1.25) return 'Tense';
    if (positive > harsh * 1.5) return 'Optimistic';
    return 'Divided';
  }

  get harshCount(): number {
    return this.posts.filter(post => ['HARSH', 'ANGRY'].includes(post.tone)).length;
  }

  loadFeed(): void {
    this.loading = true;
    this.error = '';
    this.http.get<SocialFeedPost[]>(`${urlApp}/social-feed/me`).subscribe({
      next: posts => { this.posts = posts; this.loading = false; },
      error: () => { this.error = 'Supporter feed could not be loaded.'; this.loading = false; }
    });
  }

  setFilter(filter: FeedFilter): void { this.filter = filter; }
  setOrder(order: FeedOrder): void { this.order = order; }

  toneLabel(tone: string): string {
    const labels: Record<string, string> = {
      ECSTATIC: 'Ecstatic', POSITIVE: 'Positive', LOYAL: 'Loyal', HUMOR: 'Banter',
      ANALYTICAL: 'Analysis', DEMANDING: 'Demanding', FRUSTRATED: 'Frustrated',
      CRITICAL: 'Critical', WORRIED: 'Worried', HARSH: 'Harsh', ANGRY: 'Angry'
    };
    return labels[tone] || 'Reaction';
  }

  avatar(handle: string): string {
    return handle.replace('@', '').slice(0, 2).toUpperCase();
  }
}
